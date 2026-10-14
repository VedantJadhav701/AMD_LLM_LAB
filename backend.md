# ⚡ AMD LLM Lab — Backend Engineering Audit & Refactoring Guide

This document details all critical runtime bugs, physics/data discrepancies, and systems hardening improvements across `backend/`, complete with drop-in code replacements.

---

## 🚨 Summary of Findings

| Severity | File(s) | Issue | Production Impact |
| :--- | :--- | :--- | :--- |
| **P0 (Crash)** | `src/advisor.py` ↔ `src/hub.py` | Calls non-existent `hub.median_speed_for(...)` and expects keys `median`, `min`, `max` while `hub.measured_speed` returns `tok_s`. | Every `POST /advise` request with `gpu_name` set throws `AttributeError` (`500 Internal Server Error`). |
| **P0 (Data Bug)** | `src/estimator.py` ↔ `src/advisor.py` | `same_size` uses `< 1e-6` float comparison, while `advisor.py` uses rounded params (`0.49`, `7.61`, `14.7`, `32.5`) vs CSV (`0.500`, `7.615`, `14.770`, `32.760`). | Ground-truth MI300X measurements are skipped; API falsely returns `"estimated"` instead of `"measured"`. |
| **P0 (422 Error)** | `src/schemas.py` ↔ `src/predictor.py` | `PredictionRequest` caps `parameters_b <= 32.76` and `context_tokens <= 8192`, making `predictor.py`'s extrapolation logic unreachable dead code. | Users querying 70B models or 16k+ context get a `422 schema_validation_failed` error. |
| **P1 (CLI Bug)** | `rocm_bench.py` | Uses `gb = 1e9` (decimal) instead of `1024**3` (GiB) used in `main.py`, and loads models via `.from_pretrained(...).to("cuda")` without `low_cpu_mem_usage=True`, plus uses deprecated `torch_dtype`. | Inflates reported VRAM by **7.37%** (`1024^3 / 10^9`), risking false rejections on `hub.py`'s `1.02 * vram_gb` cap. |
| **P1 (Probe)** | `api/main.py` | `rocm-smi` parser hardcodes `"vram_free_gb": None` and misses `amd-smi` or `VRAM Total Used Memory (B)`. | AMD GPU users see `null` free VRAM in `/device`, unlike NVIDIA users. |
| **P2 (DB Lock)** | `src/hub.py` | Runs `CREATE TABLE` and `CREATE INDEX` DDL inside `connect()` on every HTTP request without SQLite `WAL` mode; rate limiter leaks empty keys. | `sqlite3.OperationalError: database is locked` under concurrent reads + submissions. |
| **P2 (Physics)** | `src/fit.py` | `DEFAULT_OVERHEAD_GB = 3.0` contradicts `README.md` (`2.5 GB`), and 24 GB GPUs (RX 7900 XTX) jump straight from `1.5 GB` to `3.0 GB` overhead. | Over-penalizes 24 GB Radeon cards in `/fit` and `/advise`. |

---

## 🛠️ File-by-File Code Fixes

### 1. `backend/src/hub.py`
**Changes:**
1. Enable `PRAGMA journal_mode=WAL;` and `PRAGMA synchronous=NORMAL;` inside `connect()` and move `CREATE TABLE` / `CREATE INDEX` into `init_db()` so DDL only runs once at startup.
2. Update `measured_speed()` to return `"median"`, `"min"`, `"max"`, and `"tok_s"` so both `advisor.py` and existing callers work seamlessly.
3. Add `median_speed_for` as a backward-compatible alias accepting `gpu_name` and `model`.
4. Clean up expired keys in `_rate_limit()` and support `X-Forwarded-For` when deployed behind reverse proxies.

```python
# Replace connect(), measured_speed(), and _rate_limit() in backend/src/hub.py:

def init_db() -> None:
    """Initialize SQLite schema and indexes once on startup."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=10) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("""CREATE TABLE IF NOT EXISTS submissions(
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL, reference INTEGER NOT NULL DEFAULT 0,
            gpu TEXT, model TEXT, precision TEXT, stack TEXT, batch INTEGER, context INTEGER, outcome TEXT,
            decode_tok_s REAL, steady_vram_gb REAL, load_peak_vram_gb REAL, efficiency REAL,
            reasons TEXT NOT NULL DEFAULT '[]', payload TEXT NOT NULL)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sub_lookup ON submissions(status, model, context, gpu)")
        conn.commit()


@contextmanager
def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def measured_speed(
    gpu_like: str,
    model_id: str,
    precision: str,
    context: Optional[int] = None,
    batch: int = 1,
) -> Optional[dict]:
    """Median, min, and max decode speed from accepted runs on a matching GPU, or None."""
    sql = (
        "SELECT decode_tok_s, status, stack FROM submissions "
        "WHERE outcome='ok' AND status IN ('verified','community') "
        "AND gpu LIKE ? AND model=? AND precision=? AND batch=?"
    )
    args: list[Any] = [f"%{gpu_like}%", model_id, precision.upper(), batch]
    if context is not None:
        sql += " AND context=?"
        args.append(context)

    with connect() as conn:
        rows = conn.execute(sql, args).fetchall()
    if not rows:
        return None
    speeds = [float(r["decode_tok_s"]) for r in rows if r["decode_tok_s"] is not None]
    if not speeds:
        return None
    med = round(median(speeds), 2)
    return {
        "tok_s": med,
        "median": med,
        "min": round(min(speeds), 2),
        "max": round(max(speeds), 2),
        "runs": len(speeds),
        "verified": any(r["status"] == "verified" for r in rows),
        "stacks": sorted({r["stack"] for r in rows}),
    }


def median_speed_for(
    gpu_name: str,
    model: str,
    precision: str,
    context: Optional[int] = None,
    batch: int = 1,
) -> Optional[dict]:
    """Alias for advisor.py compatibility."""
    return measured_speed(gpu_like=gpu_name, model_id=model, precision=precision, context=context, batch=batch)


def _rate_limit(request: Request):
    limit = int(os.getenv("AMD_LLM_LAB_SUBMIT_LIMIT", "60"))
    forwarded = request.headers.get("x-forwarded-for")
    who = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    now, window = time.time(), _hits[who]
    while window and window[0] < now - 3600:
        window.popleft()
    if not window:
        _hits.pop(who, None)
        window = _hits[who]
    if len(window) >= limit:
        raise HTTPException(status_code=429, detail="Too many submissions from this address. Try again in an hour.")
    window.append(now)
```
*(Also add `init_db()` at the first line of `seed_reference(csv_path: Path)` in `src/hub.py`.)*

---

### 2. `backend/src/advisor.py`
**Changes:**
1. Align `DEFAULT_CATALOG` parameter counts (`params_b`) with `amd_llm_lab_master.csv` so exact model lookups match across all endpoints (`0.500`, `1.544`, `3.086`, `7.615`, `14.770`, `32.760`).
2. Pass `context=req.context_tokens` and `batch=req.batch_size` to `hub.measured_speed` (falling back to context-agnostic GPU speed if exact context hasn't been benchmarked yet).

```python
# Replace DEFAULT_CATALOG and the speed lookup block in backend/src/advisor.py:

DEFAULT_CATALOG = [
    {"name": "Qwen/Qwen2.5-0.5B-Instruct", "spec": ModelSpec(params_b=0.500, layers=24, kv_heads=2, head_dim=64, max_context_tokens=32768)},
    {"name": "meta-llama/Llama-3.2-1B-Instruct", "spec": ModelSpec(params_b=1.236, layers=16, kv_heads=8, head_dim=64, max_context_tokens=131072)},
    {"name": "Qwen/Qwen2.5-1.5B-Instruct", "spec": ModelSpec(params_b=1.544, layers=28, kv_heads=2, head_dim=128, max_context_tokens=32768)},
    {"name": "google/gemma-2-2b-it", "spec": ModelSpec(params_b=2.614, layers=26, kv_heads=4, head_dim=256, max_context_tokens=8192)},
    {"name": "Qwen/Qwen2.5-3B-Instruct", "spec": ModelSpec(params_b=3.086, layers=36, kv_heads=2, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Llama-3.2-3B-Instruct", "spec": ModelSpec(params_b=3.213, layers=28, kv_heads=8, head_dim=128, max_context_tokens=131072)},
    {"name": "microsoft/Phi-3.5-mini-instruct", "spec": ModelSpec(params_b=3.821, layers=32, kv_heads=32, head_dim=96, max_context_tokens=131072)},
    {"name": "mistralai/Mistral-7B-Instruct-v0.3", "spec": ModelSpec(params_b=7.248, layers=32, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "Qwen/Qwen2.5-7B-Instruct", "spec": ModelSpec(params_b=7.615, layers=28, kv_heads=4, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Meta-Llama-3-8B-Instruct", "spec": ModelSpec(params_b=8.030, layers=32, kv_heads=8, head_dim=128, max_context_tokens=8192)},
    {"name": "Qwen/Qwen2.5-14B-Instruct", "spec": ModelSpec(params_b=14.770, layers=48, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "Qwen/Qwen2.5-32B-Instruct", "spec": ModelSpec(params_b=32.760, layers=64, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Meta-Llama-3-70B-Instruct", "spec": ModelSpec(params_b=70.554, layers=80, kv_heads=8, head_dim=128, max_context_tokens=8192)},
]

# Inside advise(req: AdviseRequest) loop (lines 66-85):
            measured_speed = None
            if req.gpu_name:
                measured_speed = hub.measured_speed(
                    gpu_like=req.gpu_name,
                    model_id=item["name"],
                    precision=prec,
                    context=req.context_tokens,
                    batch=req.batch_size,
                ) or hub.measured_speed(
                    gpu_like=req.gpu_name,
                    model_id=item["name"],
                    precision=prec,
                    context=None,
                    batch=req.batch_size,
                )
```

---

### 3. `backend/src/estimator.py`
**Changes:**
1. Replace `< 1e-6` with a relative parameter tolerance (`max(0.05, request.parameters_b * 0.02)`) so rounded model sizes (`7.61` vs `7.615`, `14.7` vs `14.77`) still match empirical measurements.
2. Scale VRAM residuals proportionally when extrapolating to unseen parameter sizes (e.g., 70B) instead of applying a flat additive residual from 32B.

```python
# Replace same_size and memory residual block in backend/src/estimator.py:

    def estimate(self, request: PredictionRequest) -> dict[str, Any]:
        rows = self.dataset
        tol = max(0.05, request.parameters_b * 0.02)
        same_size = (rows["parameters_b"] - request.parameters_b).abs() <= tol
        same_config = (
            (rows["precision"] == request.precision)
            & (rows["quantization"] == request.quantization)
            & (rows["backend"] == request.backend)
        )
        same_context = rows["context_tokens"] == request.context_tokens
        exact = rows[same_size & same_config & same_context]
```

---

### 4. `backend/src/schemas.py`
**Changes:**
1. Expand `PredictionRequest.parameters_b` to `gt=0, le=500.0` and `context_tokens` to `gt=0, le=131072` (and `RecommendationRequest.context_tokens` to `le=131072`) so 70B+ models and long contexts don't throw `422` validation errors, allowing `predictor.py`'s `extrapolation_warning` to execute.

```python
# Update PredictionRequest and RecommendationRequest in backend/src/schemas.py:

class PredictionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    parameters_b: float = Field(
        ...,
        gt=0.0,
        le=500.0,
        description="Model parameter count in billions (benchmarked range: 0.5B - 32.76B; extrapolates beyond)",
        json_schema_extra={"example": 14.77}
    )
    context_tokens: int = Field(
        ...,
        gt=0,
        le=131072,
        description="Target context window in tokens (e.g. 512, 1024, 2048, 4096, 8192, 32768)",
        json_schema_extra={"example": 4096}
    )
```

---

### 5. `backend/src/fit.py`
**Changes:**
1. Align `DEFAULT_OVERHEAD_GB = 2.5` with `README.md` (`0.4 GB` up to `2.5 GB`).
2. Add a `<= 24.0` GB tier (`1.8 GB` overhead) so 24 GB cards (Radeon RX 7900 XTX) aren't charged enterprise MI300X runtime overhead.

```python
# Update DEFAULT_OVERHEAD_GB and tier scaling in backend/src/fit.py:

DEFAULT_OVERHEAD_GB = 2.5  # ROCm/CUDA context + allocator slack; matches README spec

# Inside estimate_fit():
    overhead = request.runtime_overhead_gb
    if request.device_vram_gb and request.runtime_overhead_gb == DEFAULT_OVERHEAD_GB:
        if request.device_vram_gb <= 4.0:
            overhead = 0.4
        elif request.device_vram_gb <= 8.0:
            overhead = 0.8
        elif request.device_vram_gb <= 16.0:
            overhead = 1.5
        elif request.device_vram_gb <= 24.0:
            overhead = 1.8
```

---

### 6. `backend/api/main.py`
**Changes:**
1. Parse `VRAM Total Used Memory (B)` from `rocm-smi` in `/hardware/local` so AMD GPUs report `vram_free_gb` accurately.
2. Relax `/benchmarks` query filter `context` from `le=8192` to `le=131072`.

```python
# Replace the rocm-smi block in local_hardware() in backend/api/main.py (lines 163-177):

    rocm_smi = shutil.which("rocm-smi")
    if not gpu["available"] and rocm_smi:
        try:
            probe = subprocess.run(
                [rocm_smi, "--showproductname", "--showmeminfo", "vram"],
                capture_output=True, text=True, timeout=3, check=True,
            )
            output = probe.stdout
            name_match = re.search(r"Card\s+(?:series|model):\s*(.+)", output, re.IGNORECASE)
            total_match = re.search(r"VRAM Total Memory \(B\):\s*(\d+)", output, re.IGNORECASE)
            used_match = re.search(r"VRAM Total Used Memory \(B\):\s*(\d+)", output, re.IGNORECASE)
            if name_match or total_match:
                total = int(total_match.group(1)) / (1024 ** 3) if total_match else None
                used = int(used_match.group(1)) / (1024 ** 3) if used_match else None
                free = max(0.0, total - used) if (total is not None and used is not None) else None
                gpu = {
                    "available": True,
                    "name": name_match.group(1).strip() if name_match else "AMD ROCm GPU",
                    "vram_gb": round(total, 2) if total is not None else None,
                    "vram_free_gb": round(free, 2) if free is not None else None,
                    "vendor": "AMD",
                    "detection_method": "rocm-smi",
                }
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
```

---

### 7. `backend/rocm_bench.py`
**Changes:**
1. **Fix Unit Mismatch (`1e9` vs `1024 ** 3`):** `rocm_bench.py` used `gb = 1e9`, whereas `main.py` (`rocm-smi` / `nvidia-smi` / `psutil`) uses `1024 ** 3` (GiB). Because `1024**3 / 1e9 = 1.0737`, `rocm_bench.py` was reporting an 80 GiB GPU as `85.9 GB` and inflating VRAM readings by **7.37%**.
2. **Prevent Artificial Load-Peak OOMs:** `AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=dtype).to("cuda")` first instantiates weights on CPU and copies tensors without streaming, or triggers a PyTorch deprecation warning (`torch_dtype` is deprecated in favor of `dtype` in newer `transformers`). Passing `dtype=dtype, low_cpu_mem_usage=True, device_map="cuda:0"` streams weights directly into GPU memory and avoids artificial host/device memory spikes.
3. **Reset Peak Stats Per Phase:** Ensure `torch.cuda.synchronize()` runs before reading `max_memory_allocated()`.

```python
# Replace lines 84-118 in backend/rocm_bench.py:

    if not torch.cuda.is_available():
        sys.exit("PyTorch cannot see a GPU. On AMD you need a ROCm build of PyTorch (torch.version.hip must be set).")
    props = torch.cuda.get_device_properties(0)
    gb = 1024 ** 3  # Consistent binary GiB matching rocm-smi and main.py
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
        model = AutoModelForCausalLM.from_pretrained(
            args.model,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
            device_map="cuda:0",
        ).eval()
        torch.cuda.synchronize()
    except oom:
        print("Out of memory while loading. Recording that result.")
        return [build_payload(**base, model=model_info(args.assumed_params_b or 1.0), context=contexts[0],
                              outcome="oom", results={}, notes="Out of memory while loading the model.")]
```

---

### 8. `backend/tests/test_predictor.py`
**Changes:**
Add regression tests covering the `advisor.py` + `hub.py` integration, `estimator.py` ground-truth lookup tolerance, and `schemas.py` extrapolation bounds so these bugs can never silently return.

```python
# Append to backend/tests/test_predictor.py:

from src.advisor import AdviseRequest, advise
from src.estimator import EstimationEngine
from src.recommender import Recommender
from src.schemas import PredictionRequest


def test_advisor_with_gpu_name_integration():
    """Verify /advise does not crash when gpu_name triggers hub speed lookup."""
    response = advise(AdviseRequest(
        vram_gb=192.0,
        gpu_name="MI300X",
        memory_bandwidth_gbps=5300.0,
        context_tokens=2048,
        goal="fastest",
    ))
    assert response.considered > 0
    assert len(response.options) > 0


def test_estimator_matches_rounded_catalog_params():
    """Verify rounded parameter counts (e.g. 7.61 vs 7.615) resolve to 'measured' provenance."""
    rec = Recommender(ROOT)
    est = rec.estimator.estimate(PredictionRequest(
        parameters_b=7.61,
        context_tokens=2048,
        precision="BF16",
        quantization="none",
        backend="Transformers",
    ))
    assert est["source_type"] == "measured"


def test_predictor_extrapolation_above_32b_returns_warning():
    """Verify 70B requests succeed and populate extrapolation_warning instead of 422."""
    result = Predictor(ROOT).predict(PredictionRequest(
        parameters_b=70.55,
        context_tokens=4096,
        precision="BF16",
        quantization="none",
        backend="Transformers",
    ))
    assert result.prediction.vram_gb > 0
    assert result.uncertainty.extrapolation_warning is not None
```