"""Analytic memory-fit estimator.

Answers "will this model fit on this GPU, at this precision and context?" for any
dense decoder-only model, using physics (bytes per weight + KV-cache size) instead
of a regression trained on six model sizes.

    total = weights + KV cache + runtime overhead

Inputs come from a Hugging Face ``config.json`` (fetched server-side by model id)
or are supplied explicitly. Nothing here depends on the benchmark dataset.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

router = APIRouter(tags=["fit"])

# Effective bytes per weight. Quantized formats include group-scale overhead, so they
# sit slightly above bits/8. These are approximations, surfaced in the response.
BYTES_PER_WEIGHT = {"BF16": 2.0, "FP16": 2.0, "INT8": 1.05, "INT4": 0.55, "INT2": 0.30}
DEFAULT_OVERHEAD_GB = 3.0  # ROCm/CUDA context + allocator slack; override per request
HF_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
MOE_KEYS = ("num_local_experts", "n_routed_experts", "num_experts", "moe_intermediate_size")


class ModelSpec(BaseModel):
    model_config = {"extra": "forbid"}

    params_b: float = Field(..., gt=0, le=2000, description="Parameters in billions")
    layers: int = Field(..., ge=1, le=512)
    kv_heads: int = Field(..., ge=1, le=512)
    head_dim: int = Field(..., ge=1, le=1024)
    max_context_tokens: Optional[int] = Field(None, ge=1)


class FitRequest(BaseModel):
    model_config = {"extra": "forbid"}

    hf_model_id: Optional[str] = Field(None, description="Hugging Face repo id, e.g. Qwen/Qwen2.5-7B-Instruct")
    spec: Optional[ModelSpec] = Field(None, description="Explicit architecture instead of an id")
    params_b: Optional[float] = Field(None, gt=0, le=2000, description="Override the parameter count")
    precision: Literal["BF16", "FP16", "INT8", "INT4", "INT2"] = "BF16"
    kv_cache_bytes: Literal[1, 2, 4] = Field(2, description="Bytes per KV element (2 = fp16/bf16, 1 = fp8)")
    context_tokens: int = Field(..., gt=0, le=2_000_000)
    batch_size: int = Field(1, ge=1, le=1024)
    device_vram_gb: Optional[float] = Field(None, gt=0, le=4096)
    memory_bandwidth_gbps: Optional[float] = Field(None, gt=0, le=100_000)
    runtime_overhead_gb: float = Field(DEFAULT_OVERHEAD_GB, ge=0, le=64)

    @model_validator(mode="after")
    def _one_source(self):
        if bool(self.hf_model_id) == bool(self.spec):
            raise ValueError("provide exactly one of hf_model_id or spec")
        if self.hf_model_id and not HF_ID.match(self.hf_model_id):
            raise ValueError("hf_model_id must look like 'owner/name'")
        return self


class FitResponse(BaseModel):
    model: str
    params_b: float
    params_source: Literal["config", "override", "spec"]
    precision: str
    weights_gb: float
    kv_cache_gb: float
    overhead_gb: float
    total_gb: float
    verdict: Optional[Literal["fits", "tight", "does_not_fit"]] = None
    headroom_gb: Optional[float] = None
    max_context_tokens: Optional[int] = Field(None, description="Largest context that fits at this batch size")
    decode_tok_s_ceiling: Optional[float] = Field(None, description="Bandwidth roofline; an upper bound, not a prediction")
    source_type: Literal["estimated"] = "estimated"
    warnings: list[str] = []


def params_from_config(cfg: dict[str, Any]) -> float:
    """Parameter count (billions) of a dense, gated-MLP decoder from its HF config."""
    hidden = int(cfg["hidden_size"])
    layers = int(cfg["num_hidden_layers"])
    heads = int(cfg["num_attention_heads"])
    kv = int(cfg.get("num_key_value_heads") or heads)
    head_dim = int(cfg.get("head_dim") or hidden // heads)
    inter = int(cfg["intermediate_size"])
    vocab = int(cfg["vocab_size"])
    attn = hidden * heads * head_dim * 2 + hidden * kv * head_dim * 2
    mlp = 3 * hidden * inter
    embeddings = vocab * hidden * (1 if cfg.get("tie_word_embeddings") else 2)
    return (layers * (attn + mlp) + embeddings) / 1e9


def spec_from_config(cfg: dict[str, Any]) -> ModelSpec:
    cfg = cfg.get("text_config", cfg)
    if any(cfg.get(key) for key in MOE_KEYS):
        raise ValueError("Mixture-of-experts models are not supported; pass an explicit spec instead.")
    try:
        heads = int(cfg["num_attention_heads"])
        return ModelSpec(
            params_b=params_from_config(cfg),
            layers=int(cfg["num_hidden_layers"]),
            kv_heads=int(cfg.get("num_key_value_heads") or heads),
            head_dim=int(cfg.get("head_dim") or int(cfg["hidden_size"]) // heads),
            max_context_tokens=cfg.get("max_position_embeddings"),
        )
    except KeyError as missing:
        raise ValueError(f"config.json is missing {missing}; pass an explicit spec instead.") from None


def fetch_hf_config(model_id: str, token: Optional[str] = None, transport: Optional[httpx.BaseTransport] = None) -> dict:
    """Fetch config.json for a validated repo id. The host is fixed, so the id cannot redirect the request."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        with httpx.Client(timeout=6.0, transport=transport, follow_redirects=True, max_redirects=3) as client:
            response = client.get(f"https://huggingface.co/{model_id}/resolve/main/config.json", headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Hugging Face to read the model config.") from None
    if response.status_code in (401, 403):
        raise HTTPException(status_code=400, detail=f"'{model_id}' is gated or private. Pass an explicit spec instead.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No Hugging Face model with a config.json named '{model_id}'.")
    if response.status_code != 200 or len(response.content) > 1_000_000:
        raise HTTPException(status_code=502, detail="Hugging Face returned an unexpected response.")
    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="The model config was not valid JSON.") from None
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="The model config was not a JSON object.")
    return data


@lru_cache(maxsize=256)
def _cached_config(model_id: str) -> str:
    import json
    import os

    return json.dumps(fetch_hf_config(model_id, token=os.getenv("HF_TOKEN")))


def estimate_fit(request: FitRequest, spec: ModelSpec, params_source: str, name: str) -> FitResponse:
    params_b = request.params_b or spec.params_b
    if request.params_b:
        params_source = "override"
    weights = params_b * BYTES_PER_WEIGHT[request.precision]
    kv_per_token = 2 * spec.layers * spec.kv_heads * spec.head_dim * request.kv_cache_bytes * request.batch_size / 1e9
    kv_cache = kv_per_token * request.context_tokens
    overhead = request.runtime_overhead_gb
    if request.device_vram_gb and request.runtime_overhead_gb == DEFAULT_OVERHEAD_GB:
        if request.device_vram_gb <= 4.0:
            overhead = 0.4
        elif request.device_vram_gb <= 8.0:
            overhead = 0.8
        elif request.device_vram_gb <= 16.0:
            overhead = 1.5
    total = weights + kv_cache + overhead

    warnings: list[str] = []
    if spec.max_context_tokens and request.context_tokens > spec.max_context_tokens:
        warnings.append(f"Context exceeds the model's trained maximum of {spec.max_context_tokens} tokens.")
    if request.precision in ("INT4", "INT2"):
        warnings.append("Quantized sizes assume steady-state serving. Loading can peak much higher if the "
                        "runtime quantizes from 16-bit weights on the GPU.")
    warnings.append("Assumes a dense decoder with full attention. Sliding-window layers and MoE models "
                    "change the real number; activations at large batch sizes are not modelled.")

    verdict = headroom = max_context = None
    if request.device_vram_gb:
        headroom = request.device_vram_gb - total
        verdict = "does_not_fit" if headroom < 0 else "tight" if headroom < 0.1 * request.device_vram_gb else "fits"
        free_for_kv = request.device_vram_gb - weights - overhead
        max_context = int(free_for_kv / kv_per_token) if free_for_kv > 0 and kv_per_token > 0 else 0
        if spec.max_context_tokens:
            max_context = min(max_context, spec.max_context_tokens)

    ceiling = None
    if request.memory_bandwidth_gbps:
        # Each decoded token streams the weights once plus every sequence's KV cache.
        ceiling = request.memory_bandwidth_gbps / (weights + kv_cache) * request.batch_size
        warnings.append("Throughput ceiling assumes perfect bandwidth use. Real stacks reach a fraction of it.")

    return FitResponse(
        model=name, params_b=round(params_b, 3), params_source=params_source, precision=request.precision,
        weights_gb=round(weights, 2), kv_cache_gb=round(kv_cache, 2), overhead_gb=round(overhead, 2),
        total_gb=round(total, 2), verdict=verdict,
        headroom_gb=None if headroom is None else round(headroom, 2), max_context_tokens=max_context,
        decode_tok_s_ceiling=None if ceiling is None else round(ceiling, 1), warnings=warnings,
    )


@router.post("/fit", response_model=FitResponse)
def fit(request: FitRequest):
    if request.spec:
        return estimate_fit(request, request.spec, "spec", "custom")
    import json

    config = json.loads(_cached_config(request.hf_model_id))
    try:
        spec = spec_from_config(config)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    return estimate_fit(request, spec, "config", request.hf_model_id)
