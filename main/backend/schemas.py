"""
Pydantic data schemas for AMD LLM Lab Predictor, Recommender, and API endpoints.
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, model_validator


class PredictionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    parameters_b: float = Field(
        ...,
        ge=0.5,
        le=32.76,
        description="Model parameter count in billions within the benchmarked range",
        json_schema_extra={"example": 14.77}
    )
    context_tokens: int = Field(
        ...,
        gt=0,
        le=8192,
        description="Target context window in tokens (e.g. 512, 1024, 2048, 4096, 8192)",
        json_schema_extra={"example": 4096}
    )
    precision: Literal["BF16", "FP16", "INT8", "INT4", "INT2"] = Field(
        ...,
        description="Precision format: 'BF16', 'FP16', 'INT8', 'INT4', or 'INT2'",
        json_schema_extra={"example": "INT4"}
    )
    quantization: Literal["none", "qint8", "qint4", "qint2"] = Field(
        ...,
        description="Quantization scheme: 'none', 'qint8', 'qint4', or 'qint2'",
        json_schema_extra={"example": "qint4"}
    )
    backend: Literal["Transformers", "Optimum Quanto", "Transformers + Optimum Quanto"] = Field(
        ...,
        description="Inference backend: 'Transformers', 'Optimum Quanto', or 'Transformers + Optimum Quanto'",
        json_schema_extra={"example": "Transformers + Optimum Quanto"}
    )

    @model_validator(mode="after")
    def validate_configuration(self):
        supported = {
            ("BF16", "none", "Transformers"),
            ("FP16", "none", "Transformers"),
            ("INT2", "qint2", "Transformers + Optimum Quanto"),
            ("INT4", "qint4", "Optimum Quanto"),
            ("INT4", "qint4", "Transformers + Optimum Quanto"),
            ("INT8", "qint8", "Transformers + Optimum Quanto"),
        }
        configuration = (self.precision, self.quantization, self.backend)
        if configuration not in supported:
            raise ValueError("unsupported precision, quantization, and backend combination")
        return self


# Compatibility aliases for the predictor/recommender internals.
PredictionInput = PredictionRequest


class UncertaintyInfo(BaseModel):
    vram_mae_gb: float = Field(..., description="VRAM prediction Mean Absolute Error (GB)")
    throughput_mae_tok_s: float = Field(..., description="Throughput prediction Mean Absolute Error (tok/s)")
    vram_guidance: str = Field(..., description="VRAM model application guidance")
    throughput_guidance: str = Field(..., description="Throughput model application guidance")
    extrapolation_warning: Optional[str] = Field(None, description="Warning if inputs exceed validated range")


class PredictionValues(BaseModel):
    vram_gb: float = Field(..., description="Estimated peak VRAM consumption in GB")
    throughput_tok_s: float = Field(..., description="Estimated token generation throughput in tok/s")


class PredictionResponse(BaseModel):
    prediction: PredictionValues
    uncertainty: UncertaintyInfo = Field(..., description="Prediction error & uncertainty metrics")
    model_version: str = Field("v1.5.0", description="Estimation service release version")
    prediction_type: Literal["measured", "estimated", "interpolated"] = "estimated"
    training_dataset: str = "amd_llm_lab_master.csv"
    source_type: Literal["measured", "estimated", "interpolated"] = "estimated"
    source_id: str = "throughput_predictor_v1.5.0"
    source_count: int = Field(0, ge=0)
    vram_source_type: Literal["measured", "estimated", "interpolated"] = "estimated"
    throughput_source_type: Literal["measured", "estimated", "interpolated"] = "estimated"


PredictionOutput = PredictionResponse


class RecommendationRequest(BaseModel):
    model_config = {"extra": "forbid"}

    available_vram_gb: float = Field(
        ...,
        gt=0,
        description="Maximum available GPU VRAM memory limit in GB",
        json_schema_extra={"example": 24.0}
    )
    minimum_throughput_tok_s: float = Field(
        ...,
        ge=0,
        description="Minimum acceptable token generation speed in tok/s",
        json_schema_extra={"example": 10.0}
    )
    context_tokens: int = Field(
        ...,
        gt=0,
        le=8192,
        description="Desired context token length",
        json_schema_extra={"example": 4096}
    )
    objective: Literal["throughput", "memory", "balanced"] = Field(
        ...,
        description="Optimization target: 'throughput', 'memory', or 'balanced'",
        json_schema_extra={"example": "throughput"}
    )


RecommendationInput = RecommendationRequest

class ConfigurationRecommendation(BaseModel):
    rank: int = Field(..., description="Recommendation ranking order (1 = highest recommendation)")
    model: str = Field(..., description="Model size identifier (e.g. 'Qwen2.5-7B')")
    parameters_b: float = Field(..., description="Model parameters in billions")
    precision: str = Field(..., description="Precision setting")
    quantization: str = Field(..., description="Quantization setting")
    backend: str = Field(..., description="Inference backend engine")
    predicted_vram_gb: float = Field(..., description="Predicted peak VRAM consumption in GB")
    predicted_generation_tok_s: float = Field(..., description="Predicted generation throughput in tok/s")
    fits_vram: bool = Field(..., description="True if predicted VRAM <= available VRAM limit")
    meets_throughput: bool = Field(..., description="True if predicted throughput >= minimum throughput threshold")
    score: float = Field(..., description="Composite ranking score for the selected objective")
    vram_mae_gb: float = Field(..., description="Empirical VRAM MAE; VRAM estimate is size-based")
    throughput_mae_tok_s: float = Field(..., description="Empirical throughput MAE")
    source_type: Literal["measured", "estimated", "interpolated"] = "estimated"
    source_id: str = "throughput_predictor_v1.5.0"
    source_count: int = Field(0, ge=0)
    vram_source_type: Literal["measured", "estimated", "interpolated"] = "estimated"
    throughput_source_type: Literal["measured", "estimated", "interpolated"] = "estimated"


class RecommendationResponse(BaseModel):
    feasible_configurations: List[ConfigurationRecommendation] = Field(
        ...,
        description="List of candidate configurations meeting constraints, ordered by rank"
    )
    total_candidates_evaluated: int = Field(..., description="Total candidate configurations evaluated")
    feasible_count: int = Field(..., description="Number of configurations meeting all constraints")
    objective: Literal["throughput", "memory", "balanced"] = Field(..., description="Optimization objective used")
    constraints: Dict[str, Any] = Field(..., description="Constraints evaluated")
    model_version: str = Field("v1.5.0", description="Estimation service release version")
    warning: str = Field(..., description="Interpretation limits for these recommendations")
    prediction_type: Literal["estimated"] = "estimated"
    training_dataset: str = "amd_llm_lab_master.csv"
    candidate_configurations: List[ConfigurationRecommendation] = Field(default_factory=list)


RecommendationOutput = RecommendationResponse


class HardwareInfo(BaseModel):
    gpu: str = Field(..., description="GPU recorded by the benchmark environment")
    vram_gb: float = Field(..., description="VRAM recorded by the benchmark environment")
    architecture: str = Field(..., description="Architecture recorded by the benchmark environment")
    rocm: Optional[str] = Field(None, description="ROCm version recorded by the benchmark environment")
    pytorch: Optional[str] = Field(None, description="PyTorch version recorded by the benchmark environment")


class LocalHardwareInfo(BaseModel):
    host_scope: Literal["fastapi_host"] = "fastapi_host"
    platform: str
    system: str
    release: str
    cpu: Dict[str, Any]
    memory: Dict[str, Any]
    gpu: Dict[str, Any]


class ModelInfo(BaseModel):
    model: str = Field(..., description="Model identifier")
    parameters_b: float = Field(..., description="Parameter count in billions")
    precisions: List[str] = Field(..., description="Available benchmarked precisions")
    quantizations: List[str] = Field(..., description="Available benchmarked quantizations")
    backends: List[str] = Field(..., description="Available inference backends")
    context_lengths: List[int] = Field(..., description="Tested context lengths")


class EvaluationMetrics(BaseModel):
    vram_mae_gb: float
    vram_rmse_gb: float
    vram_r2: float
    throughput_mae_tok_s: float
    throughput_rmse_tok_s: float
    throughput_r2: float
    validation_method: str = "Leave-One-Model-Out"


class HealthResponse(BaseModel):
    status: Literal["ok"]
    model_version: str
    dataset_rows: int


class EvaluationResponse(BaseModel):
    method: str
    throughput_mae_tok_s: float
    throughput_r2: float
    vram_mae_gb: float
    vram_r2: float


class MetadataResponse(BaseModel):
    version: Dict[str, Any]
    model_metadata: Dict[str, Any]
    feature_schema: Dict[str, Any]
    recommender_metadata: Dict[str, Any]


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class BenchmarkRecord(BaseModel):
    model: str
    parameters_b: float
    precision: str
    quantization: str
    context_tokens: int
    output_tokens: float
    latency_s: Optional[float] = None
    generation_tok_s: Optional[float] = None
    peak_vram_gb: float
    memory_per_billion_params_gb: Optional[float] = None
    tokens_per_gb: Optional[float] = None
    vram_utilization_pct: Optional[float] = None
    hardware: str
    gpu: str
    gpu_vram_gb: float
    backend: str
    source_file: str
    source_type: Literal["measured"] = "measured"
    source_id: str = "amd_llm_lab_master.csv"
