"""Empirical provenance and calibrated estimates for measured MI300X configurations."""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.predictor import Predictor
from src.schemas import PredictionRequest


class EstimationEngine:
    def __init__(self, predictor: Predictor, dataset: pd.DataFrame):
        self.predictor = predictor
        self.dataset = dataset.copy()
        self.dataset["_predicted_vram_gb"] = self.dataset["parameters_b"].map(predictor.predict_vram)
        self.dataset["_predicted_speed_tok_s"] = [
            predictor.predict_throughput(
                float(row.parameters_b), int(row.context_tokens), row.precision,
                row.quantization, row.backend,
            ) for row in self.dataset.itertuples()
        ]
        self.dataset["_vram_residual"] = self.dataset["peak_vram_gb"] - self.dataset["_predicted_vram_gb"]
        self.dataset["_speed_residual"] = pd.to_numeric(
            self.dataset["generation_tok_s"], errors="coerce"
        ) - self.dataset["_predicted_speed_tok_s"]

    def estimate(self, request: PredictionRequest) -> dict[str, Any]:
        rows = self.dataset
        same_size = (rows["parameters_b"] - request.parameters_b).abs() < 0.02
        same_config = (
            (rows["precision"] == request.precision)
            & (rows["quantization"] == request.quantization)
            & (rows["backend"] == request.backend)
        )
        same_context = rows["context_tokens"] == request.context_tokens
        exact = rows[same_size & same_config & same_context]

        estimate_vram = self.predictor.predict_vram(request.parameters_b)
        estimate_speed = self.predictor.predict_throughput(
            request.parameters_b, request.context_tokens, request.precision,
            request.quantization, request.backend,
        )
        if not exact.empty:
            record = exact.iloc[0]
            measured_speed = record.get("generation_tok_s")
            return {
                "vram_gb": round(float(record["peak_vram_gb"]), 2),
                "throughput_tok_s": round(float(measured_speed), 2) if pd.notna(measured_speed) else estimate_speed,
                "source_type": "measured",
                "source_id": "amd_llm_lab_master.csv",
                "confidence": 1.0,
                "data_coverage": 1.0,
                "source_count": int(len(exact)),
            }

        # Nearby observations calibrate predictor residuals; they are never emitted as measurements.
        anchors = rows[same_size].copy()
        if anchors.empty:
            nearest_size = (rows["parameters_b"] - request.parameters_b).abs().min()
            anchors = rows[(rows["parameters_b"] - request.parameters_b).abs() == nearest_size].copy()
        weights = []
        for row in anchors.itertuples():
            feature_match = (1 + 3 * (row.precision == request.precision)
                             + 2 * (row.quantization == request.quantization)
                             + 2 * (row.backend == request.backend))
            context_weight = 1 / (1 + abs(int(row.context_tokens) - request.context_tokens) / 4096)
            size_weight = 1 / (1 + abs(float(row.parameters_b) - request.parameters_b))
            weights.append(feature_match * context_weight * size_weight)
        anchor_weights = pd.Series(weights, index=anchors.index, dtype=float)

        speed_residuals = anchors["_speed_residual"]
        speed_valid = speed_residuals.notna()
        if speed_valid.any():
            speed_weights = anchor_weights[speed_valid]
            correction = float((speed_residuals[speed_valid] * speed_weights).sum() / speed_weights.sum())
            estimate_speed = max(0.0, round(estimate_speed + correction, 2))

        memory_residuals = pd.to_numeric(anchors["_vram_residual"], errors="coerce")
        memory_valid = memory_residuals.notna()
        if memory_valid.any():
            memory_weights = anchor_weights[memory_valid]
            memory_correction = float((memory_residuals[memory_valid] * memory_weights).sum() / memory_weights.sum())
            estimate_vram = max(0.0, round(estimate_vram + memory_correction, 2))

        exact_size = rows[same_size]
        same_model_precision = exact_size[exact_size["precision"] == request.precision]
        same_model_backend = exact_size[exact_size["backend"] == request.backend]
        context_anchors = exact_size[
            (exact_size["precision"] == request.precision)
            & (exact_size["quantization"] == request.quantization)
            & (exact_size["backend"] == request.backend)
        ]
        coverage = min(1.0, 0.35 * bool(not exact_size.empty)
                       + 0.25 * bool(not same_model_precision.empty)
                       + 0.2 * bool(not same_model_backend.empty)
                       + 0.2 * bool(not context_anchors.empty))
        contexts = context_anchors["context_tokens"].tolist()
        bracketed = any(value < request.context_tokens for value in contexts) and any(
            value > request.context_tokens for value in contexts
        )
        source_type = "interpolated" if bracketed else "estimated"
        confidence = min(0.92, 0.35 + coverage * 0.45 + min(len(anchors), 3) * 0.04)
        return {
            "vram_gb": estimate_vram,
            "throughput_tok_s": estimate_speed,
            "source_type": source_type,
            "source_id": (f"amd_llm_lab_master.csv+predictor_artifacts_v"
                          f"{self.predictor.artifact_version}+estimation_v{self.predictor.version}"),
            "confidence": round(confidence, 2),
            "data_coverage": round(coverage, 2),
            "source_count": int(len(anchors)),
        }
