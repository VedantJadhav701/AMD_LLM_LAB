"""One row = one measured run of one model file on one machine. Keep this file the single source of truth."""
import pandas as pd

# ---- identifiers (not used as features) ----
ID_COLS = ["run_id", "collected_at", "client_version", "source"]   # source: "harness" | "app" | "hub" | "synthetic"

# ---- hardware (what the machine is) ----
HW_COLS = [
    "hw_id",                # stable hash of the fields below; used to group rows for leave-hardware-out validation
    "os", "arch", "cpu_name", "cpu_vendor", "cpu_cores_phys", "cpu_threads",
    "ram_total_gib", "ram_free_gib_at_start", "ram_type", "ram_speed_mts",
    "gpu_name", "gpu_vendor", "gpu_arch", "gpu_kind",          # kind: discrete | integrated | apple | none
    "gpu_vram_gib", "gpu_vram_free_gib_at_start", "gpu_bw_gbps_spec",
    "mem_probe_gbps",       # measured system read bandwidth, from the app's memory probe
    "on_battery", "power_mode", "driver_version",
]

# ---- software ----
SW_COLS = ["backend", "backend_version", "llama_cpp_build", "flash_attn", "kv_type_k", "kv_type_v", "n_threads", "n_batch", "n_ubatch", "use_mmap"]

# ---- model file ----
MODEL_COLS = [
    "model_id", "model_family", "params_b", "active_params_b", "n_layers", "n_kv_heads", "head_dim",
    "quant", "bpw_effective", "file_gib", "is_moe", "sliding_window_fraction",
]

# ---- run configuration ----
RUN_COLS = ["ctx_tokens", "prompt_tokens", "gen_tokens", "n_gpu_layers", "n_layers_total", "offload_frac_requested", "batch_size"]

# ---- TARGETS (measured) ----
TARGETS = [
    "decode_tok_s",         # steady-state generation speed, median of repeats
    "decode_tok_s_std",
    "prefill_tok_s",
    "ttft_s",
    "load_s",
    "peak_vram_gib",        # NaN when the GPU memory could not be read
    "peak_ram_gib",         # resident set of the inference process
    "offload_frac_actual",  # share of the model actually on the GPU (Ollama /api/ps size_vram/size, or ngl/n_layers)
    "outcome",              # ok | oom | crash | timeout
    "thermal_throttled",    # 1 if decode speed fell > 20% between first and last repeat
]

ALL_COLS = ID_COLS + HW_COLS + SW_COLS + MODEL_COLS + RUN_COLS + TARGETS

def validate(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows that violate physics or are incomplete. Returns the clean frame; prints what was dropped."""
    n0 = len(df)
    ok = df[df["outcome"] == "ok"].copy()
    bad = pd.Series(False, index=ok.index)
    bad |= ok["decode_tok_s"].isna() | (ok["decode_tok_s"] <= 0)
    # Streamed bytes per token cannot exceed the best possible memory bandwidth: reject impossible speeds.
    best_bw = ok[["gpu_bw_gbps_spec", "mem_probe_gbps"]].max(axis=1, skipna=True)
    implied = ok["decode_tok_s"] * ok["file_gib"] * 1.0737 * (ok["active_params_b"].fillna(ok["params_b"]) / ok["params_b"])
    bad |= implied > best_bw * 1.3
    bad |= ok["peak_vram_gib"] > ok["gpu_vram_gib"].fillna(0) * 1.03 + (ok["gpu_kind"] != "discrete") * 1e9
    bad |= ok["offload_frac_actual"].notna() & ~ok["offload_frac_actual"].between(0, 1.0001)
    clean = ok[~bad]
    print(f"validate: {n0} rows in, {len(ok)} outcome=ok, {len(clean)} kept, {int(bad.sum())} dropped as impossible")
    return clean
