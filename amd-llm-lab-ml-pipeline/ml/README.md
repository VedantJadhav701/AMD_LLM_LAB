# Speed / memory prediction models for AMD LLM Lab

Goal: predict, for any (laptop, model file, quantization, context, offload) combination:
decode tokens/s (as a 10/50/90% range), prefill tokens/s, time to first token, peak VRAM, peak RAM, and the share of the model that ends up on the GPU.

## 0. Honest starting point

There is no real dataset yet. The MI300X CSV is one datacenter GPU on Transformers + Quanto and is not usable for laptops (Quanto is slower than BF16 there, and its memory numbers include load-time peaks). This folder gives you the **schema, the collection harness, the features, and the training/validation pipeline**. `make_synthetic.py` only proves the code runs; its numbers say nothing about real accuracy.

Until real data exists, the app's physics model plus the user's own benchmark calibration is the better predictor. Train ML only when the data below exists.

## 1. How much data

| Need | Target |
|---|---|
| Distinct machines | 30+ (this is what limits you, not row count). 10 is the bare minimum for a first look. |
| Spread of machines | NVIDIA laptop and desktop, AMD discrete and integrated (Ryzen AI, Strix Halo), Intel iGPU/Arc, Apple M1 to M4 (base, Pro, Max), CPU-only |
| Models | 20+ spanning 1B to 70B, dense and MoE, with different layer counts and KV heads |
| Quants | Q8_0, Q6_K, Q5_K_M, Q4_K_M, IQ4_XS, Q3_K_M, Q2_K, IQ2_XXS (plus IQ1_S) |
| Context | 512, 2048, 8192, 16384, 32768 |
| Offload | 100%, 75%, 50%, 25%, 0% of layers, and deliberately too-big models to capture the cliff and OOM |
| Repeats | 3 per cell, record the std dev |
| Rows | roughly 1,000 to 3,000 per machine, so 30k to 100k total |

Also collect failures (`outcome` = oom/crash/timeout). They teach the "will not run" boundary.

## 2. Where the data comes from

1. **Your own harness** (`collect_bench.py`) on every machine you can reach: your laptop, friends' laptops, cloud AMD/NVIDIA instances, a Mac. Ask people to run one command.
2. **The desktop app** (opt-in): each benchmark already measures decode/prefill speed and placement; extend it to write this schema and submit to the hub after the user previews the payload. This is the long-term source.
3. **Public llama.cpp benchmark threads** (GitHub discussions that collect `llama-bench` results for Apple Silicon, CUDA, Vulkan/AMD). Useful for many machines quickly, but they are self-reported and have fewer fields. Check each source's licence and rules before using, and verify the thread names yourself. Mark these `source="public"` and weight them lower.
4. Do not scrape random forum posts or mix in numbers you cannot trace.

## 3. Schema

See `schema.py`. One row per run. Groups: hardware (incl. `hw_id`, `gpu_bw_gbps_spec`, `mem_probe_gbps`), software (backend, build, flash attention, KV type), model file (params, active params, layers, KV heads, head dim, quant, effective bpw, file size), run config (context, requested offload), and targets (decode/prefill tok/s, TTFT, peak VRAM, peak RAM, actual offload, outcome, throttling flag).

Record the conditions that change speed: plugged in vs battery, power mode, driver version, and free RAM/VRAM at the start. Run on AC power with the machine cool for the training set; record battery/throttled runs separately.

## 4. Modelling strategy

- **Physics baseline first.** Decode is memory-bound: tok/s is about bandwidth / bytes streamed per token. `features.py` computes a roofline that mixes GPU and CPU bandwidth by offload fraction. The ML model learns `log(measured / roofline)`, a smooth efficiency factor. This needs far less data than learning raw tok/s and extrapolates to unseen hardware.
- **Quantile models** (10/50/90) so the app shows a range with honest width.
- **Memory targets** are residuals on `need = weights + KV + overhead`.
- **Offload fraction** is a residual on `min(1, VRAM / need)`.
- **MoE**: stream bytes use active parameters, memory uses total.
- Start with gradient boosting (`HistGradientBoostingRegressor`). Only try neural nets once you have 100k+ rows.

## 5. Validation (the part people skip)

- **Leave-one-hardware-out** (`GroupKFold` on `hw_id`). Random row splits leak the same machine into train and test and report fantasy accuracy.
- Report: MAPE, share within +/-20%, median error, and the coverage of the 10-90% interval (should be near 80%), against the baseline (roofline with one global efficiency).
- Ship only if it beats the baseline on held-out hardware: `python train.py --require-win`.
- Slice errors by backend, GPU kind, quant, and offload fraction. The split/offload regime is where errors hide.

## 6. Run it

```
pip install -r requirements.txt
python collect_bench.py --llama-bench ./llama-bench --models-dir ./gguf --out data/runs.jsonl   # on each machine
cat machineA/runs.jsonl machineB/runs.jsonl > data/runs.jsonl
python train.py --data data/runs.jsonl --out model --require-win
python make_synthetic.py && python train.py --data data/synthetic.jsonl --out /tmp/m   # smoke test only
```
Verify llama-bench flags and JSON field names with `llama-bench --help` and one manual run; they change between builds. The harness reads fields defensively but I could not test it against a real llama-bench here.

## 7. Using the model inside the app (not built)

Options: export with `skl2onnx` and run via `onnxruntime-node` in the Electron main process, or distill the model into a small lookup of efficiency curves per backend in `src/core/hwdb.ts`. Neither is implemented or tested. Keep the physics engine as the fallback, and use calibration from the user's own benchmark on top (it is always more accurate than a population model for that machine).

## 8. Pitfalls

- Thermal throttling and battery mode: log them, do not mix them into clean training rows.
- Prefill is compute-bound, decode is bandwidth-bound; model them separately (the pipeline does).
- Same model under different runtimes (llama.cpp vs Ollama vs MLX) are different populations: keep `backend` as a feature or train per backend.
- Peak VRAM is hard to read on Apple and Windows integrated GPUs; leave it empty rather than guess.
- Privacy: submitted rows contain hardware model strings only; no usernames, paths, hostnames or IPs. Keep it that way.
