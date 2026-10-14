#!/usr/bin/env python3
"""
Data collection harness. Run on every machine you can get (your own, friends, cloud AMD/NVIDIA, Macs).
It sweeps models x quants x context x GPU-offload with llama.cpp's llama-bench and appends one JSON line per
measurement to data/runs.jsonl, plus hardware facts and peak memory.

Usage:
  python collect_bench.py --llama-bench /path/to/llama-bench --models-dir ./gguf --out data/runs.jsonl \
      --ctx 512 2048 8192 --offload 1.0 0.75 0.5 0.25 0.0 --repeats 3

Models: put GGUF files in --models-dir. Naming it "<family>-<params>b-<QUANT>.gguf" lets the harness read
metadata from the name; otherwise it falls back to what llama-bench reports. Use a spread of sizes and quants:
the model needs both fitting and non-fitting cases to learn the offload cliff.

VERIFY the llama-bench flags against `llama-bench --help` for your build; they change between versions.
"""
import argparse, hashlib, json, os, platform, re, subprocess, sys, threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path
import psutil

def sh(cmd, timeout=20):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, shell=isinstance(cmd, str)).stdout.strip()
    except Exception:
        return ""

# ---------- hardware facts ----------
def hardware():
    h = {"os": platform.system().lower(), "arch": platform.machine().lower(), "cpu_threads": psutil.cpu_count(logical=True),
         "cpu_cores_phys": psutil.cpu_count(logical=False), "ram_total_gib": psutil.virtual_memory().total / 2**30,
         "ram_free_gib_at_start": psutil.virtual_memory().available / 2**30, "cpu_name": platform.processor() or "",
         "gpu_name": None, "gpu_vendor": "none", "gpu_kind": "none", "gpu_vram_gib": None, "gpu_vram_free_gib_at_start": None,
         "gpu_arch": None, "driver_version": None, "on_battery": None}
    b = psutil.sensors_battery() if hasattr(psutil, "sensors_battery") else None
    if b is not None: h["on_battery"] = int(not b.power_plugged)
    if sys.platform == "linux":
        m = re.search(r"model name\s*:\s*(.+)", open("/proc/cpuinfo").read()); h["cpu_name"] = m.group(1).strip() if m else h["cpu_name"]
    if sys.platform == "darwin":
        h["cpu_name"] = sh(["sysctl", "-n", "machdep.cpu.brand_string"]) or h["cpu_name"]
        if "Apple" in h["cpu_name"]:
            h.update(gpu_name=h["cpu_name"], gpu_vendor="apple", gpu_kind="apple", gpu_vram_gib=h["ram_total_gib"])
    smi = sh(["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version", "--format=csv,noheader,nounits"])
    if smi:
        n, tot, free, drv = [x.strip() for x in smi.splitlines()[0].split(",")]
        h.update(gpu_name=n, gpu_vendor="nvidia", gpu_kind="discrete", gpu_vram_gib=float(tot) / 1024, gpu_vram_free_gib_at_start=float(free) / 1024, driver_version=drv)
    else:
        r = sh("rocm-smi --showproductname --showmeminfo vram --json")
        if r:
            try:
                d = json.loads(r); k = next(iter(d)); h.update(gpu_vendor="amd", gpu_kind="discrete", gpu_name=d[k].get("Card Series") or d[k].get("Card series"))
                tot = d[k].get("VRAM Total Memory (B)"); used = d[k].get("VRAM Total Used Memory (B)")
                if tot: h["gpu_vram_gib"] = int(tot) / 2**30; h["gpu_vram_free_gib_at_start"] = (int(tot) - int(used or 0)) / 2**30
            except Exception: pass
    key = "|".join(str(h.get(k)) for k in ["cpu_name", "gpu_name", "ram_total_gib", "gpu_vram_gib", "os"])
    h["hw_id"] = hashlib.sha1(key.encode()).hexdigest()[:12]
    return h

# ---------- memory sampling while a command runs ----------
def vram_used_gib():
    s = sh(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], 5)
    if s: return float(s.splitlines()[0]) / 1024
    r = sh("rocm-smi --showmeminfo vram --json", 5)
    if r:
        try: d = json.loads(r); return int(d[next(iter(d))]["VRAM Total Used Memory (B)"]) / 2**30
        except Exception: return None
    return None   # Apple/Windows-integrated: leave empty rather than guess

def run_with_peaks(cmd, timeout):
    peak = {"ram": 0.0, "vram": None}; base_v = vram_used_gib(); stop = threading.Event()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    def poll():
        try: p = psutil.Process(proc.pid)
        except psutil.Error: return
        while not stop.is_set():
            try:
                rss = sum(c.memory_info().rss for c in [p] + p.children(recursive=True)) / 2**30; peak["ram"] = max(peak["ram"], rss)
                v = vram_used_gib()
                if v is not None and base_v is not None: peak["vram"] = max(peak["vram"] or 0, v - base_v)
            except psutil.Error: break
            time.sleep(0.25)
    t = threading.Thread(target=poll, daemon=True); t.start()
    try: out, err = proc.communicate(timeout=timeout); rc = proc.returncode
    except subprocess.TimeoutExpired: proc.kill(); out, err, rc = "", "timeout", -9
    stop.set(); t.join(1)
    return rc, out, err, peak

# ---------- model metadata from the file name (extend as needed) ----------
def parse_name(path):
    n = Path(path).stem; q = re.search(r"(IQ\d_[A-Z]+|Q\d_K_[SML]|Q\d_K|Q\d_\d|F16|BF16)", n, re.I)
    p = re.search(r"(\d+(?:\.\d+)?)[bB]", n)
    return {"quant": q.group(1).upper() if q else None, "params_b": float(p.group(1)) if p else None, "model_id": n}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--llama-bench", required=True); ap.add_argument("--models-dir", required=True); ap.add_argument("--out", default="data/runs.jsonl")
    ap.add_argument("--ctx", type=int, nargs="+", default=[512, 2048, 8192]); ap.add_argument("--offload", type=float, nargs="+", default=[1.0, 0.5, 0.0])
    ap.add_argument("--repeats", type=int, default=3); ap.add_argument("--gen", type=int, default=128); ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--n-layers", type=json.loads, default={}, help='JSON map model_id -> layer count, e.g. \'{"llama-3.1-8b-Q4_K_M":32}\'')
    a = ap.parse_args()
    hw = hardware(); Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    for f in sorted(Path(a.models_dir).glob("*.gguf")):
        meta = parse_name(f); layers = a.n_layers.get(meta["model_id"], 99)
        for ctx in a.ctx:
            for off in a.offload:
                ngl = 999 if off >= 1.0 else int(round(off * layers))
                # -p = prompt tokens (prefill test), -n = generated tokens, -d = depth (context already filled before generation)
                cmd = [a.llama_bench, "-m", str(f), "-p", str(min(ctx, 512)), "-n", str(a.gen), "-d", str(max(0, ctx - 512)), "-ngl", str(ngl), "-r", str(a.repeats), "-o", "jsonl"]
                rc, out, err, peak = run_with_peaks(cmd, a.timeout)
                row = {"run_id": uuid.uuid4().hex, "collected_at": datetime.now(timezone.utc).isoformat(), "source": "harness", **hw, **meta,
                       "file_gib": f.stat().st_size / 2**30, "ctx_tokens": ctx, "gen_tokens": a.gen, "n_gpu_layers": ngl, "offload_frac_requested": off,
                       "n_layers_total": layers if layers != 99 else None, "peak_ram_gib": peak["ram"], "peak_vram_gib": peak["vram"], "outcome": "ok" if rc == 0 else ("timeout" if rc == -9 else "oom" if re.search(r"out of memory|alloc", err, re.I) else "crash")}
                if rc == 0:
                    for line in out.splitlines():
                        try: j = json.loads(line)
                        except json.JSONDecodeError: continue
                        # Field names vary by build; read defensively and verify with your llama-bench version.
                        if j.get("n_gen", 0) > 0: row.update(decode_tok_s=j.get("avg_ts"), decode_tok_s_std=j.get("stddev_ts"), params_b=(j.get("model_n_params") or 0) / 1e9 or meta["params_b"], llama_cpp_build=j.get("build_commit"), backend=j.get("backends"), n_threads=j.get("n_threads"), flash_attn=j.get("flash_attn"))
                        elif j.get("n_prompt", 0) > 0: row.update(prefill_tok_s=j.get("avg_ts"))
                with open(a.out, "a") as fh: fh.write(json.dumps(row) + "\n")
                print(f"{meta['model_id']} ctx={ctx} off={off}: {row.get('decode_tok_s')} tok/s ({row['outcome']})")

if __name__ == "__main__":
    main()
