"""
VRAM and Throughput Predictor module for AMD LLM Lab.
Loads pre-trained machine learning models and makes predictions with empirical uncertainty estimates.
"""

import json
from pathlib import Path
import joblib
import pandas as pd

from src.schemas import PredictionInput, PredictionOutput, PredictionValues, UncertaintyInfo


class Predictor:
    """Predictor class encapsulating VRAM and Throughput ML models."""

    def __init__(self, root_dir: Path = None):
        if root_dir is None:
            # Resolve root directory relative to this file: src/predictor.py -> AMD_LLM_LAB/
            root_dir = Path(__file__).resolve().parent.parent

        self.root_dir = root_dir
        self.models_dir = self.root_dir / "models"
        self.config_dir = self.root_dir / "config"

        self._load_models()
        self._load_configs()

    def _load_models(self):
        vram_path = self.models_dir / "vram_predictor.joblib"
        tp_path = self.models_dir / "throughput_predictor.joblib"

        if not vram_path.exists():
            raise FileNotFoundError(f"VRAM predictor model not found at {vram_path}")
        if not tp_path.exists():
            raise FileNotFoundError(f"Throughput predictor model not found at {tp_path}")

        self.vram_model = joblib.load(vram_path)
        self.throughput_model = joblib.load(tp_path)

        # Expected feature columns for throughput model
        self.tp_feature_names = getattr(
            self.throughput_model,
            "feature_names_in_",
            [
                'parameters_b', 'context_tokens', 'precision_BF16', 'precision_FP16',
                'precision_INT2', 'precision_INT4', 'precision_INT8', 'quantization_none',
                'quantization_qint2', 'quantization_qint4', 'quantization_qint8',
                'backend_Optimum Quanto', 'backend_Transformers',
                'backend_Transformers + Optimum Quanto'
            ]
        )

    def _load_configs(self):
        schema_path = self.config_dir / "feature_schema.json"
        uncertainty_path = self.config_dir / "uncertainty.json"
        version_path = self.config_dir / "version.json"

        with open(schema_path, "r", encoding="utf-8") as f:
            self.feature_schema = json.load(f)

        with open(uncertainty_path, "r", encoding="utf-8") as f:
            self.uncertainty_config = json.load(f)

        if version_path.exists():
            with open(version_path, "r", encoding="utf-8") as f:
                ver_data = json.load(f)
                self.version = ver_data.get("version", "v0.1.0")
                self.artifact_version = ver_data.get("predictor_artifact_version", "unknown")
        else:
            self.version = "v0.1.0"
            self.artifact_version = "unknown"

    def predict_vram(self, parameters_b: float) -> float:
        """Predict peak VRAM in GB for a given parameter count in billions."""
        X = pd.DataFrame([[parameters_b]], columns=["parameters_b"])
        vram_pred = float(self.vram_model.predict(X)[0])
        return max(0.0, round(vram_pred, 2))

    def predict_throughput(
        self,
        parameters_b: float,
        context_tokens: int,
        precision: str,
        quantization: str,
        backend: str
    ) -> float:
        """Predict token generation throughput in tokens/sec for given configuration."""
        # Initialize zero dict for all 14 features
        feature_data = {col: 0.0 for col in self.tp_feature_names}
        feature_data['parameters_b'] = float(parameters_b)
        feature_data['context_tokens'] = float(context_tokens)

        # One-hot categorical indicators
        prec_col = f"precision_{precision.upper()}"
        quant_col = f"quantization_{quantization.lower()}"
        backend_col = f"backend_{backend}"

        if prec_col in feature_data:
            feature_data[prec_col] = 1.0
        if quant_col in feature_data:
            feature_data[quant_col] = 1.0
        if backend_col in feature_data:
            feature_data[backend_col] = 1.0

        X = pd.DataFrame([feature_data])[list(self.tp_feature_names)]
        tp_pred = float(self.throughput_model.predict(X)[0])
        return max(0.0, round(tp_pred, 2))

    def predict(self, input_data: PredictionInput) -> PredictionOutput:
        """Perform full VRAM & Throughput prediction for a PredictionInput object."""
        vram_pred = self.predict_vram(input_data.parameters_b)
        tp_pred = self.predict_throughput(
            parameters_b=input_data.parameters_b,
            context_tokens=input_data.context_tokens,
            precision=input_data.precision,
            quantization=input_data.quantization,
            backend=input_data.backend
        )

        vram_mae = self.uncertainty_config["vram"]["mae_gb"]
        tp_mae = self.uncertainty_config["throughput"]["mae_tok_s"]
        guidance = self.uncertainty_config.get("application_guidance", {})

        extrapolation_warning = None
        if input_data.parameters_b > 32.76 or input_data.parameters_b < 0.5:
            extrapolation_warning = (
                f"Model size {input_data.parameters_b}B is outside the benchmarked range (0.5B - 32.76B). "
                "Predictions carry higher uncertainty."
            )

        uncertainty_info = UncertaintyInfo(
            vram_mae_gb=round(vram_mae, 2),
            throughput_mae_tok_s=round(tp_mae, 2),
            vram_guidance=guidance.get(
                "vram_guidance",
                "VRAM prediction is size-based baseline and conservative."
            ),
            throughput_guidance=guidance.get(
                "throughput_guidance",
                "Throughput uses full configuration predictor with LOOMO MAE ~12 tok/s."
            ),
            extrapolation_warning=extrapolation_warning
        )

        return PredictionOutput(
            prediction=PredictionValues(vram_gb=vram_pred, throughput_tok_s=tp_pred),
            uncertainty=uncertainty_info,
            model_version=self.version,
            prediction_type="estimated",
            training_dataset="amd_llm_lab_master.csv",
        )
