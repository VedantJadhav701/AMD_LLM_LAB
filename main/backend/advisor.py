"""Model advisor module: 'I have this GPU. What should I run?'"""

from typing import Literal, Optional, List
from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.fit import FitRequest, ModelSpec, estimate_fit
from src import hub

router = APIRouter(tags=["advisor"])

DEFAULT_CATALOG = [
    {"name": "Qwen/Qwen2.5-0.5B-Instruct", "spec": ModelSpec(params_b=0.49, layers=24, kv_heads=2, head_dim=64, max_context_tokens=32768)},
    {"name": "meta-llama/Llama-3.2-1B-Instruct", "spec": ModelSpec(params_b=1.23, layers=16, kv_heads=8, head_dim=64, max_context_tokens=131072)},
    {"name": "Qwen/Qwen2.5-1.5B-Instruct", "spec": ModelSpec(params_b=1.54, layers=28, kv_heads=2, head_dim=128, max_context_tokens=32768)},
    {"name": "google/gemma-2-2b-it", "spec": ModelSpec(params_b=2.61, layers=26, kv_heads=4, head_dim=256, max_context_tokens=8192)},
    {"name": "Qwen/Qwen2.5-3B-Instruct", "spec": ModelSpec(params_b=3.09, layers=36, kv_heads=2, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Llama-3.2-3B-Instruct", "spec": ModelSpec(params_b=3.21, layers=28, kv_heads=8, head_dim=128, max_context_tokens=131072)},
    {"name": "microsoft/Phi-3.5-mini-instruct", "spec": ModelSpec(params_b=3.82, layers=32, kv_heads=32, head_dim=96, max_context_tokens=131072)},
    {"name": "mistralai/Mistral-7B-Instruct-v0.3", "spec": ModelSpec(params_b=7.24, layers=32, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "Qwen/Qwen2.5-7B-Instruct", "spec": ModelSpec(params_b=7.61, layers=28, kv_heads=4, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Meta-Llama-3-8B-Instruct", "spec": ModelSpec(params_b=8.03, layers=32, kv_heads=8, head_dim=128, max_context_tokens=8192)},
    {"name": "Qwen/Qwen2.5-14B-Instruct", "spec": ModelSpec(params_b=14.7, layers=48, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "Qwen/Qwen2.5-32B-Instruct", "spec": ModelSpec(params_b=32.5, layers=64, kv_heads=8, head_dim=128, max_context_tokens=32768)},
    {"name": "meta-llama/Meta-Llama-3-70B-Instruct", "spec": ModelSpec(params_b=70.55, layers=80, kv_heads=8, head_dim=128, max_context_tokens=8192)},
]

class AdviseRequest(BaseModel):
    vram_gb: float = Field(..., gt=0, le=4096)
    gpu_name: Optional[str] = None
    memory_bandwidth_gbps: Optional[float] = Field(None, gt=0, le=100_000)
    context_tokens: int = Field(2048, gt=0, le=2_000_000)
    batch_size: int = Field(1, ge=1, le=1024)
    goal: Literal["biggest_model", "fastest", "longest_context"] = "biggest_model"
    min_decode_tok_s: Optional[float] = Field(None, ge=0)
    limit: int = Field(10, ge=1, le=50)

class SpeedInfo(BaseModel):
    source: Literal["measured", "estimated", "ceiling"]
    tok_s: float
    low: Optional[float] = None
    high: Optional[float] = None
    runs: Optional[int] = None
    verified: Optional[bool] = None
    note: str

class AdviseOption(BaseModel):
    rank: int
    model: str
    params_b: float
    precision: str
    verdict: Literal["fits", "tight"]
    total_gb: float
    headroom_gb: float
    max_context_tokens: int
    speed: Optional[SpeedInfo] = None

class AdviseResponse(BaseModel):
    options: List[AdviseOption]
    considered: int
    too_big: int
    below_speed_target: int
    measured_count: int
    notes: List[str]

@router.post("/advise", response_model=AdviseResponse)
def advise(req: AdviseRequest):
    precisions: List[Literal["BF16", "FP16", "INT8", "INT4"]] = ["BF16", "FP16", "INT8", "INT4"]
    candidates = []
    considered = 0
    too_big = 0
    below_speed_target = 0
    measured_count = 0

    for item in DEFAULT_CATALOG:
        for prec in precisions:
            considered += 1
            fit_req = FitRequest(
                spec=item["spec"],
                precision=prec,
                context_tokens=req.context_tokens,
                batch_size=req.batch_size,
                device_vram_gb=req.vram_gb,
                memory_bandwidth_gbps=req.memory_bandwidth_gbps,
            )
            fit_res = estimate_fit(fit_req, item["spec"], "spec", item["name"])
            if fit_res.verdict not in ("fits", "tight"):
                too_big += 1
                continue

            # Speed determination
            measured_speed = hub.median_speed_for(gpu_name=req.gpu_name, model=item["name"], precision=prec) if req.gpu_name else None
            if measured_speed:
                measured_count += 1
                speed = SpeedInfo(
                    source="measured",
                    tok_s=round(measured_speed["median"], 1),
                    low=round(measured_speed.get("min", measured_speed["median"]), 1),
                    high=round(measured_speed.get("max", measured_speed["median"]), 1),
                    runs=measured_speed.get("runs", 1),
                    verified=measured_speed.get("verified", False),
                    note="Measured on a matching GPU in the community hub",
                )
            elif fit_res.decode_tok_s_ceiling:
                speed = SpeedInfo(
                    source="ceiling",
                    tok_s=round(fit_res.decode_tok_s_ceiling * 0.7, 1),
                    note="Estimated roofline based on memory bandwidth",
                )
            else:
                speed = None

            if req.min_decode_tok_s and speed and speed.tok_s < req.min_decode_tok_s:
                below_speed_target += 1
                continue

            candidates.append({
                "model": item["name"],
                "params_b": item["spec"].params_b,
                "precision": prec,
                "verdict": fit_res.verdict,
                "total_gb": fit_res.total_gb,
                "headroom_gb": fit_res.headroom_gb or 0.0,
                "max_context_tokens": fit_res.max_context_tokens or 0,
                "speed": speed,
            })

    # Sorting based on goal
    if req.goal == "fastest":
        candidates.sort(key=lambda x: (x["speed"].tok_s if x["speed"] else 0, x["params_b"]), reverse=True)
    elif req.goal == "longest_context":
        candidates.sort(key=lambda x: (x["max_context_tokens"], x["params_b"]), reverse=True)
    else:  # biggest_model
        candidates.sort(key=lambda x: (x["params_b"], x["headroom_gb"]), reverse=True)

    options = []
    for rank, c in enumerate(candidates[:req.limit], start=1):
        options.append(AdviseOption(
            rank=rank,
            model=c["model"],
            params_b=c["params_b"],
            precision=c["precision"],
            verdict=c["verdict"],
            total_gb=c["total_gb"],
            headroom_gb=c["headroom_gb"],
            max_context_tokens=c["max_context_tokens"],
            speed=c["speed"],
        ))

    return AdviseResponse(
        options=options,
        considered=considered,
        too_big=too_big,
        below_speed_target=below_speed_target,
        measured_count=measured_count,
        notes=[f"Evaluated {considered} model/precision combinations for {req.vram_gb} GB VRAM."],
    )
