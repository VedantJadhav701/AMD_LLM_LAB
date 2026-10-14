import numpy as np, pandas as pd

GIB_PER_GB = 1 / 1.0737

def kv_gib(df):
    per_tok = 2 * df["n_layers"] * df["n_kv_heads"] * df["head_dim"] * 2          # f16 K+V bytes per token
    sw = df["sliding_window_fraction"].fillna(0)
    eff_ctx = (1 - sw) * df["ctx_tokens"] + sw * np.minimum(df["ctx_tokens"], 1024)
    return per_tok * eff_ctx / 2**30

def add_physics(df: pd.DataFrame) -> pd.DataFrame:
    """Physics-based baselines. The ML model learns the residual on top of these, which is far more data-efficient
    than learning tokens/s from scratch and extrapolates sensibly to hardware it has not seen."""
    d = df.copy()
    d["active_frac"] = (d["active_params_b"].fillna(d["params_b"]) / d["params_b"]).clip(0, 1)
    d["kv_gib"] = kv_gib(d)
    d["stream_gib"] = d["file_gib"] * d["active_frac"] + d["kv_gib"]
    d["need_gib"] = d["file_gib"] + d["kv_gib"] + 0.5 + 0.02 * d["ctx_tokens"] / 1024
    gpu_bw = d["gpu_bw_gbps_spec"].where(d["gpu_kind"] != "none", np.nan)
    cpu_bw = d["mem_probe_gbps"].fillna(40.0)
    f = d["offload_frac_requested"].fillna(0).clip(0, 1)
    f = f.where(gpu_bw.notna(), 0.0)
    # Time per token = GPU share streamed from VRAM + CPU share streamed from RAM (they run one after the other).
    t = f * d["stream_gib"] / (gpu_bw.fillna(1) * GIB_PER_GB) + (1 - f) * d["stream_gib"] / (cpu_bw * GIB_PER_GB)
    d["roofline_tok_s"] = 1.0 / t
    d["vram_fit_ratio"] = d["gpu_vram_gib"].fillna(0) / d["need_gib"]
    d["ram_fit_ratio"] = d["ram_free_gib_at_start"] / d["need_gib"]
    d["log_params"] = np.log(d["params_b"]); d["log_stream"] = np.log(d["stream_gib"])
    d["log_gpu_bw"] = np.log(gpu_bw.fillna(cpu_bw)); d["bw_ratio_gpu_cpu"] = gpu_bw.fillna(cpu_bw) / cpu_bw
    return d

NUM = ["cpu_cores_phys", "cpu_threads", "ram_total_gib", "ram_free_gib_at_start", "ram_speed_mts", "gpu_vram_gib", "gpu_bw_gbps_spec", "mem_probe_gbps",
       "on_battery", "params_b", "active_frac", "n_layers", "n_kv_heads", "head_dim", "bpw_effective", "file_gib", "is_moe", "ctx_tokens", "offload_frac_requested",
       "kv_gib", "stream_gib", "need_gib", "roofline_tok_s", "vram_fit_ratio", "ram_fit_ratio", "log_params", "log_stream", "log_gpu_bw", "bw_ratio_gpu_cpu", "flash_attn", "n_threads"]
CAT = ["os", "arch", "cpu_vendor", "gpu_vendor", "gpu_kind", "gpu_arch", "backend", "quant", "model_family"]

def design(df: pd.DataFrame, cats=None):
    X = df[[c for c in NUM if c in df]].astype(float).copy()
    cats = cats or {c: sorted(df[c].dropna().astype(str).unique()) for c in CAT if c in df}
    for c, vals in cats.items():
        s = df[c].astype(str)
        for v in vals: X[f"{c}={v}"] = (s == v).astype(float)
    return X, cats
