#!/usr/bin/env python3
"""AMD LLM Lab benchmark client.

Measures one Hugging Face model on the GPU in this machine and writes a results file.
Nothing is sent anywhere unless you pass --submit. What would be sent is printed first:
GPU name, VRAM, ROCm/driver/torch versions, OS name, and the measured numbers. No prompts,
paths, usernames or hostnames.

    pip install torch transformers          # a ROCm build of PyTorch for AMD GPUs
    python rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --contexts 512,2048
    python rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --submit --api https://your-hub.example

Memory is reported in three phases because they answer different questions:
  load_peak  - the high-water mark while loading (what you need to *start* the model)
  steady     - memory held once loaded (what you need to *keep* it running)
  run_peak   - the high-water mark during prefill and decoding at this context length
"""

from __future__ import annotations

import argparse
import gc
import json
import platform
import statistics
import sys
import time
import urllib.error
import urllib.request

CLIENT_VERSION = "0.1"
# Published peak memory bandwidth in GB/s, used only to score how much of it decoding reaches.
KNOWN_BANDWIDTH_GBPS = {
    "mi325x": 6000, "mi300x": 5300, "mi210": 1638,
    "7900 xtx": 960, "7900 xt": 800, "7800 xt": 624, "9070 xt": 640,
}


def bandwidth_for(gpu_name: str, override: float | None = None) -> float | None:
    if override:
        return override
    name = gpu_name.lower()
    return next((bw for key, bw in KNOWN_BANDWIDTH_GBPS.items() if key in name), None)


def decode_rate(t_total: float, t_prefill: float, new_tokens: int, batch: int) -> float | None:
    """Tokens/s spent decoding: the first token comes from prefill, so subtract that run."""
    seconds = t_total - t_prefill
    return (new_tokens - 1) * batch / seconds if new_tokens > 1 and seconds > 0 else None


def drop_none(value):
    if isinstance(value, dict):
        return {k: drop_none(v) for k, v in value.items() if v is not None}
    return value


def build_payload(*, hardware: dict, software: dict, model: dict, context: int, output_tokens: int,
                  batch: int, outcome: str, results: dict, notes: str | None = None) -> dict:
    return drop_none({
        "client_version": CLIENT_VERSION, "hardware": hardware, "software": software, "model": model,
        "run": {"batch_size": batch, "context_tokens": context, "output_tokens": output_tokens},
        "outcome": outcome, "results": results, "notes": notes,
    })


def post(api: str, payload: dict) -> tuple[int, dict]:
    request = urllib.request.Request(api.rstrip("/") + "/submissions", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as reply:
            return reply.status, json.load(reply)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.load(error)
        except ValueError:
            return error.code, {}
    except urllib.error.URLError as error:
        return 0, {"error": {"message": str(error.reason)}}


def measure(args) -> list[dict]:
    import torch
    import transformers
    from transformers import AutoModelForCausalLM

    if not torch.cuda.is_available():
        sys.exit("PyTorch cannot see a GPU. On AMD you need a ROCm build of PyTorch (torch.version.hip must be set).")
    props = torch.cuda.get_device_properties(0)
    gb = 1e9
    hardware = {
        "gpu_name": props.name, "vram_gb": round(props.total_memory / gb, 2),
        "arch": getattr(props, "gcnArchName", None), "rocm_version": getattr(torch.version, "hip", None),
        "os": f"{platform.system()} {platform.release()}"[:60],
        "memory_bandwidth_gbps": bandwidth_for(props.name, args.bandwidth),
    }
    software = {"stack": "transformers", "stack_version": transformers.__version__, "torch_version": torch.__version__[:60]}
    dtype = {"bf16": torch.bfloat16, "fp16": torch.float16}[args.precision]
    oom = torch.cuda.OutOfMemoryError
    contexts = [int(c) for c in args.contexts.split(",")]
    base = dict(hardware=hardware, software=software, output_tokens=args.output_tokens, batch=args.batch)

    def model_info(params_b):
        return {"hf_model_id": args.model, "params_b": round(params_b, 3), "precision": args.precision.upper()}

    print(f"GPU: {hardware['gpu_name']} ({hardware['vram_gb']} GB)  model: {args.model}  precision: {args.precision}")
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    try:
        model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=dtype).to("cuda").eval()
    except oom:
        print("Out of memory while loading. Recording that result.")
        return [build_payload(**base, model=model_info(args.assumed_params_b or 1.0), context=contexts[0],
                              outcome="oom", results={}, notes="Out of memory while loading the model.")]
    params_b = sum(p.numel() for p in model.parameters()) / 1e9
    load_peak = torch.cuda.max_memory_allocated() / gb
    gc.collect()
    torch.cuda.empty_cache()
    steady = torch.cuda.memory_allocated() / gb
    print(f"loaded {params_b:.2f}B params, load peak {load_peak:.2f} GB, steady {steady:.2f} GB")

    vocab = model.config.vocab_size
    payloads = []

    def generate(ctx, new_tokens):
        ids = torch.randint(100, vocab - 100, (args.batch, ctx), device="cuda")
        torch.cuda.synchronize()
        start = time.perf_counter()
        model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), do_sample=False,
                       max_new_tokens=new_tokens, min_new_tokens=new_tokens, pad_token_id=0)
        torch.cuda.synchronize()
        return time.perf_counter() - start

    with torch.inference_mode():
        generate(min(contexts), 8)  # warm-up: kernel compilation and allocator growth
        for ctx in contexts:
            try:
                torch.cuda.reset_peak_memory_stats()
                rates, prefills, ttfts = [], [], []
                for _ in range(args.repeats):
                    t_prefill = generate(ctx, 1)
                    t_total = generate(ctx, args.output_tokens)
                    rate = decode_rate(t_total, t_prefill, args.output_tokens, args.batch)
                    if rate:
                        rates.append(rate)
                    prefills.append(args.batch * ctx / t_prefill)
                    ttfts.append(t_prefill)
                results = {
                    "load_peak_vram_gb": round(load_peak, 3), "steady_vram_gb": round(steady, 3),
                    "run_peak_vram_gb": round(torch.cuda.max_memory_allocated() / gb, 3),
                    "decode_tok_s": round(statistics.median(rates), 2) if rates else None,
                    "prefill_tok_s": round(statistics.median(prefills), 1), "ttft_s": round(statistics.median(ttfts), 4),
                }
                print(f"context {ctx:>6}: decode {results['decode_tok_s']} tok/s, prefill {results['prefill_tok_s']} tok/s, "
                      f"peak {results['run_peak_vram_gb']} GB")
                payloads.append(build_payload(**base, model=model_info(params_b), context=ctx, outcome="ok", results=results))
            except oom:
                print(f"context {ctx:>6}: out of memory. Recording that result and stopping.")
                torch.cuda.empty_cache()
                payloads.append(build_payload(**base, model=model_info(params_b), context=ctx, outcome="oom", results={},
                                              notes="Out of memory during generation."))
                break
    return payloads


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="Hugging Face id, e.g. Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--precision", choices=["bf16", "fp16"], default="bf16")
    parser.add_argument("--contexts", default="512,2048", help="comma-separated prompt lengths")
    parser.add_argument("--output-tokens", type=int, default=128)
    parser.add_argument("--batch", type=int, default=1)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--bandwidth", type=float, help="GPU memory bandwidth in GB/s if your card isn't known")
    parser.add_argument("--assumed-params-b", type=float, help="used only to record an out-of-memory load")
    parser.add_argument("--out", default="amd_llm_lab_results.json")
    parser.add_argument("--submit", action="store_true", help="send the results to the hub")
    parser.add_argument("--api", help="hub API base URL, required with --submit")
    args = parser.parse_args(argv)
    if args.submit and not args.api:
        parser.error("--submit needs --api")
    if args.output_tokens < 2 or args.repeats < 1 or args.batch < 1:
        parser.error("--output-tokens must be at least 2; --repeats and --batch at least 1")

    payloads = measure(args)
    with open(args.out, "w", encoding="utf-8") as file:
        json.dump(payloads, file, indent=2)
    print(f"\nWrote {len(payloads)} result(s) to {args.out}")
    if not args.submit:
        print("Nothing was sent. Re-run with --submit --api <url> to share them.")
        return 0
    print("Sending exactly what is in that file.")
    failed = 0
    for payload in payloads:
        status, body = post(args.api, payload)
        ok = status in (200, 201)
        failed += not ok
        label = body.get("status", "") if ok else body.get("error", {}).get("message", f"HTTP {status}")
        print(f"  context {payload['run']['context_tokens']}: {'accepted' if ok else 'rejected'} ({label})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
