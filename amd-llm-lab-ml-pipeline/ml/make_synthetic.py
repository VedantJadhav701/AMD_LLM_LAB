#!/usr/bin/env python3
"""
SYNTHETIC data for smoke-testing the pipeline ONLY. Not real measurements. Do not train a shipped model on it.
It deliberately uses a different functional form from features.py so the pipeline has something to learn.
"""
import argparse, hashlib, json, uuid
import numpy as np
rng = np.random.default_rng(7)
HW = [  # name, vendor, kind, vram, bw, ram, cpu_bw
    ("RTX 4060 Laptop", "nvidia", "discrete", 8, 256, 32, 55), ("RTX 3050 Laptop", "nvidia", "discrete", 4, 192, 16, 45), ("RTX 4090", "nvidia", "discrete", 24, 1008, 64, 80),
    ("RX 7600M XT", "amd", "discrete", 8, 288, 32, 60), ("RX 7900 XTX", "amd", "discrete", 24, 960, 64, 85), ("Apple M2", "apple", "apple", 12, 100, 16, 90),
    ("Apple M3 Max", "apple", "apple", 96, 400, 128, 300), ("Radeon 890M", "amd", "integrated", 0, 120, 32, 100), ("Iris Xe", "intel", "integrated", 0, 68, 16, 50),
    ("GTX 1650", "nvidia", "discrete", 4, 128, 16, 40), ("RTX 3070 Laptop", "nvidia", "discrete", 8, 448, 32, 55), ("Strix Halo", "amd", "integrated", 96, 256, 128, 200),
]
MODELS = [("llama-3.2-3b", 3.2, 28, 8, 128), ("llama-3.1-8b", 8.0, 32, 8, 128), ("qwen2.5-14b", 14.8, 48, 8, 128), ("qwen2.5-32b", 32.8, 64, 8, 128), ("gemma-3-4b", 4.3, 34, 4, 256)]
Q = {"Q8_0": 8.5, "Q6_K": 6.56, "Q5_K_M": 5.7, "Q4_K_M": 4.9, "Q3_K_M": 4.0, "Q2_K": 3.2, "IQ2_XXS": 2.38}
rows = []
for name, vendor, kind, vram, bw, ram, cbw in HW:
    hw_id = hashlib.sha1(name.encode()).hexdigest()[:12]
    for mid, pb, L, kvh, hd in MODELS:
        for q, bpw in Q.items():
            fgib = pb * 1e9 * bpw / 8 / 2**30
            for ctx in (512, 2048, 8192):
                for off in (1.0, 0.5, 0.0):
                    kv = 2 * L * kvh * hd * 2 * ctx / 2**30; need = fgib + kv + 0.5 + 0.02 * ctx / 1024
                    use_vram = vram if kind == "discrete" else vram * 0.9
                    f = off if vram > 0 else 0.0
                    f = min(f, max(0.0, (use_vram - 0.5 - kv) / fgib)) if f > 0 else 0.0     # layers that actually fit
                    if kind == "discrete" and f < off: pass
                    stream = fgib + kv
                    eff = np.clip((0.9 - 0.0004 * bw) * (1 - 0.5 * np.exp(-stream / 1.5)), 0.25, 0.9) * rng.lognormal(0, 0.07)
                    t = f * stream / (bw * eff / 1.0737) + (1 - f) * stream / (cbw * 0.6 / 1.0737) + (0.004 if f > 0 and f < 1 else 0)
                    oom = (f == 0 and need > ram * 0.85)
                    rows.append({"run_id": uuid.uuid4().hex, "collected_at": "synthetic", "client_version": "0", "source": "synthetic", "hw_id": hw_id, "os": "linux", "arch": "x64",
                        "cpu_name": "x", "cpu_vendor": "amd", "cpu_cores_phys": 8, "cpu_threads": 16, "ram_total_gib": ram, "ram_free_gib_at_start": ram * 0.7, "gpu_name": name, "gpu_vendor": vendor,
                        "gpu_kind": kind, "gpu_vram_gib": vram or None, "gpu_bw_gbps_spec": bw if kind != "integrated" else bw, "mem_probe_gbps": cbw, "backend": "vulkan", "flash_attn": 0, "n_threads": 8,
                        "model_id": mid, "model_family": mid.split("-")[0], "params_b": pb, "active_params_b": None, "n_layers": L, "n_kv_heads": kvh, "head_dim": hd, "quant": q, "bpw_effective": bpw,
                        "file_gib": fgib, "is_moe": 0, "sliding_window_fraction": 0.0, "ctx_tokens": ctx, "gen_tokens": 128, "offload_frac_requested": off,
                        "decode_tok_s": None if oom else 1 / t, "prefill_tok_s": None if oom else 400 * (bw / 200) / (pb / 8) * rng.lognormal(0, .1),
                        "peak_vram_gib": f * (fgib + kv) + 0.6 if f > 0 else None, "peak_ram_gib": (1 - f) * fgib + 0.5, "offload_frac_actual": f, "outcome": "oom" if oom else "ok"})
with open("data/synthetic.jsonl", "w") as fh:
    for r in rows: fh.write(json.dumps(r) + "\n")
print(len(rows), "synthetic rows -> data/synthetic.jsonl")
