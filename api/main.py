"""FastAPI service for the AMD LLM Lab predictors and benchmark data."""

import json
import csv
import logging
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.predictor import Predictor
from src.recommender import Recommender
from src.schemas import (
    BenchmarkRecord,
    EvaluationResponse,
    ErrorResponse,
    HardwareInfo,
    LocalHardwareInfo,
    HealthResponse,
    MetadataResponse,
    ModelInfo,
    PredictionRequest,
    PredictionResponse,
    RecommendationRequest,
    RecommendationResponse,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
predictor = Predictor(ROOT_DIR)
recommender = Recommender(ROOT_DIR, predictor=predictor)
DATASET = pd.read_csv(ROOT_DIR / "data" / "amd_llm_lab_master.csv")
estimator = recommender.estimator
logger = logging.getLogger("amd_llm_lab.api")

app = FastAPI(title="AMD LLM Lab API", version=predictor.version.lstrip("v"))
origins = [origin.strip() for origin in os.getenv("AMD_LLM_LAB_CORS_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Invalid request"},
    404: {"model": ErrorResponse, "description": "Resource not found"},
    422: {"model": ErrorResponse, "description": "Request validation failed"},
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {
        "code": "schema_validation_failed",
        "message": "Request values failed validation.",
        "details": jsonable_encoder(exc.errors()),
    }})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    code = "not_found" if exc.status_code == 404 else "invalid_request" if exc.status_code == 400 else "http_error"
    message = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": message}}, headers=exc.headers)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logger.exception("Unexpected API error for %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": {
        "code": "internal_error",
        "message": "An unexpected server error occurred.",
    }})


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.post("/predict", response_model=PredictionResponse, responses=ERROR_RESPONSES)
def predict(request: PredictionRequest):
    result = predictor.predict(request)
    provenance = estimator.estimate(request)
    result.prediction.vram_gb = provenance["vram_gb"]
    result.prediction.throughput_tok_s = provenance["throughput_tok_s"]
    result.prediction_type = provenance["source_type"]
    result.source_type = provenance["source_type"]
    result.source_id = provenance["source_id"]
    result.confidence = provenance["confidence"]
    result.data_coverage = provenance["data_coverage"]
    result.source_count = provenance["source_count"]
    return result


@app.post("/recommend", response_model=RecommendationResponse, responses=ERROR_RESPONSES)
def recommend(request: RecommendationRequest):
    return recommender.recommend(request)


@app.get("/models", response_model=list[ModelInfo], responses={500: {"model": ErrorResponse}})
def models():
    records = []
    for model, group in DATASET.groupby("model", sort=False):
        records.append(ModelInfo(
            model=model,
            parameters_b=float(group["parameters_b"].iloc[0]),
            precisions=sorted(group["precision"].dropna().unique().tolist()),
            quantizations=sorted(group["quantization"].dropna().unique().tolist()),
            backends=sorted(group["backend"].dropna().unique().tolist()),
            context_lengths=sorted(group["context_tokens"].dropna().astype(int).unique().tolist()),
        ))
    return records


@app.get("/hardware", response_model=HardwareInfo, responses={500: {"model": ErrorResponse}})
def hardware():
    with (ROOT_DIR / "config" / "environment.json").open(encoding="utf-8") as file:
        config = json.load(file)
    return HardwareInfo(
        gpu=config.get("hardware", "AMD Instinct MI300X"),
        vram_gb=config.get("gpu_vram_gb", 192.0),
        architecture=config.get("gpu_architecture", "gfx942"),
        rocm="7.2.x",
        pytorch=config.get("torch_version", "unknown"),
    )


@app.get("/hardware/local", response_model=LocalHardwareInfo, responses={500: {"model": ErrorResponse}})
def local_hardware():
    """Inspect the machine running this FastAPI process, not the remote browser."""
    try:
        import psutil
        virtual_memory = psutil.virtual_memory()
        total_memory = round(virtual_memory.total / (1024 ** 3), 2)
        available_memory = round(virtual_memory.available / (1024 ** 3), 2)
        logical_cores = psutil.cpu_count(logical=True) or os.cpu_count() or 1
        physical_cores = psutil.cpu_count(logical=False)
    except ImportError:
        total_memory = available_memory = None
        logical_cores = os.cpu_count() or 1
        physical_cores = None

    cpu_name = platform.processor() or platform.machine() or "Unknown CPU"
    system = platform.system() or "Unknown"
    gpu = {"available": False, "name": None, "vram_gb": None, "vram_free_gb": None,
           "vendor": None, "detection_method": "unavailable"}
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            probe = subprocess.run(
                [nvidia_smi, "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=3, check=True,
            )
            fields = next(csv.reader(probe.stdout.splitlines(), skipinitialspace=True))
            if len(fields) >= 3:
                gpu = {"available": True, "name": fields[0].strip(),
                       "vram_gb": round(float(fields[1]) / 1024, 2),
                       "vram_free_gb": round(float(fields[2]) / 1024, 2),
                       "vendor": "NVIDIA", "detection_method": "nvidia-smi"}
        except (OSError, subprocess.SubprocessError, ValueError, StopIteration):
            pass
    rocm_smi = shutil.which("rocm-smi")
    if not gpu["available"] and rocm_smi:
        try:
            probe = subprocess.run([rocm_smi, "--showproductname", "--showmeminfo", "vram"],
                                   capture_output=True, text=True, timeout=3, check=True)
            output = probe.stdout
            name_match = re.search(r"Card series:\s*(.+)", output, re.IGNORECASE)
            total_match = re.search(r"Total Memory \(B\):\s*(\d+)", output, re.IGNORECASE)
            if name_match:
                total = int(total_match.group(1)) / (1024 ** 3) if total_match else None
                gpu = {"available": True, "name": name_match.group(1).strip(),
                       "vram_gb": round(total, 2) if total else None,
                       "vram_free_gb": None, "vendor": "AMD",
                       "detection_method": "rocm-smi"}
        except (OSError, subprocess.SubprocessError, ValueError):
            pass

    return LocalHardwareInfo(
        platform=f"{system} {platform.release()}".strip(),
        system=system,
        release=platform.release(),
        cpu={"name": cpu_name, "logical_cores": logical_cores, "physical_cores": physical_cores},
        memory={"total_gb": total_memory, "available_gb": available_memory},
        gpu=gpu,
    )


@app.get("/benchmarks", response_model=list[BenchmarkRecord], responses=ERROR_RESPONSES)
def benchmarks(
    model: Optional[str] = None,
    precision: Optional[Literal["BF16", "FP16", "INT8", "INT4", "INT2"]] = None,
    quantization: Optional[Literal["none", "qint8", "qint4", "qint2"]] = None,
    backend: Optional[Literal["Transformers", "Optimum Quanto", "Transformers + Optimum Quanto"]] = None,
    context: Optional[int] = Query(default=None, gt=0, le=8192),
    context_tokens: Optional[int] = Query(default=None, gt=0, le=8192, include_in_schema=False),
    parameters_b: Optional[float] = Query(default=None, gt=0),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    if context is not None and context_tokens is not None and context != context_tokens:
        raise HTTPException(status_code=400, detail="context and context_tokens cannot disagree")
    selected_context = context if context is not None else context_tokens
    records = DATASET
    if model:
        records = records[records["model"].str.contains(model, case=False, regex=False)]
        if records.empty:
            raise HTTPException(status_code=404, detail=f"No benchmarked model matches '{model}'.")
    if precision:
        records = records[records["precision"].str.casefold() == precision.casefold()]
    if quantization:
        records = records[records["quantization"].str.casefold() == quantization.casefold()]
    if backend:
        records = records[records["backend"].str.casefold() == backend.casefold()]
    if selected_context is not None:
        records = records[records["context_tokens"] == selected_context]
    if parameters_b is not None:
        tolerance = max(0.1, parameters_b * 0.1)
        records = records[(records["parameters_b"] - parameters_b).abs() <= tolerance]
        if records.empty:
            raise HTTPException(status_code=404, detail=f"No benchmarked model size matches {parameters_b}B.")
    page = records.iloc[offset:offset + limit].astype(object)
    page = page.where(pd.notna(page), None)
    return page.to_dict(orient="records")


@app.get("/health", response_model=HealthResponse, responses={500: {"model": ErrorResponse}})
def health():
    return {"status": "ok", "model_version": predictor.version, "dataset_rows": len(DATASET)}


@app.get("/metadata", response_model=MetadataResponse, responses={500: {"model": ErrorResponse}})
def metadata():
    files = ("version.json", "model_metadata.json", "feature_schema.json", "recommender_metadata.json")
    result = {}
    for filename in files:
        with (ROOT_DIR / "config" / filename).open(encoding="utf-8") as file:
            result[filename.removesuffix(".json")] = json.load(file)
    return result


@app.get("/evaluation", response_model=EvaluationResponse, responses={500: {"model": ErrorResponse}})
def evaluation():
    with (ROOT_DIR / "config" / "model_metadata.json").open(encoding="utf-8") as file:
        return json.load(file).get("validation", {})
