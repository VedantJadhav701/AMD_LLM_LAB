"""Configuration recommendations built from the saved MI300X predictors."""

import json
from pathlib import Path
from typing import Optional

import pandas as pd

from src.predictor import Predictor
from src.estimator import EstimationEngine
from src.schemas import (
    ConfigurationRecommendation,
    PredictionRequest,
    RecommendationInput,
    RecommendationOutput,
)


class Recommender:
    """Generate, filter, and rank model/configuration candidates."""

    def __init__(self, root_dir: Optional[Path] = None, predictor: Optional[Predictor] = None):
        self.root_dir = Path(root_dir) if root_dir else Path(__file__).resolve().parent.parent
        self.predictor = predictor or Predictor(self.root_dir)
        with (self.root_dir / "config" / "recommender_metadata.json").open(encoding="utf-8") as file:
            self.metadata = json.load(file)
        dataset = pd.read_csv(self.root_dir / "data" / "amd_llm_lab_master.csv")
        self.estimator = EstimationEngine(self.predictor, dataset)
        self.model_sizes = (
            dataset[["model", "parameters_b"]]
            .drop_duplicates()
            .sort_values("parameters_b")
            .to_dict("records")
        )

    def recommend(self, request: RecommendationInput) -> RecommendationOutput:
        configurations = self.metadata["configurations"]
        candidates = []
        for model in self.model_sizes:
            for config in configurations:
                estimate = self.estimator.estimate(PredictionRequest(
                    parameters_b=float(model["parameters_b"]),
                    context_tokens=request.context_tokens,
                    precision=config["precision"], quantization=config["quantization"],
                    backend=config["backend"],
                ))
                vram = estimate["vram_gb"]
                throughput = estimate["throughput_tok_s"]
                candidates.append({
                    "model": model["model"],
                    "parameters_b": float(model["parameters_b"]),
                    **config,
                    "predicted_vram_gb": vram,
                    "predicted_generation_tok_s": throughput,
                    "fits_vram": vram <= request.available_vram_gb,
                    "meets_throughput": throughput >= request.minimum_throughput_tok_s,
                    "source_type": estimate["source_type"],
                    "source_id": estimate["source_id"],
                    "source_count": estimate["source_count"],
                    "vram_source_type": estimate["vram_source_type"],
                    "throughput_source_type": estimate["throughput_source_type"],
                })

        def rank(items):
            if not items:
                return []
            tp = [item["predicted_generation_tok_s"] for item in items]
            mem = [item["predicted_vram_gb"] for item in items]
            tp_min, tp_max = min(tp), max(tp)
            mem_min, mem_max = min(mem), max(mem)
            for item in items:
                throughput_score = (item["predicted_generation_tok_s"] - tp_min) / (tp_max - tp_min or 1)
                memory_score = (mem_max - item["predicted_vram_gb"]) / (mem_max - mem_min or 1)
                item["score"] = {
                    "throughput": throughput_score,
                    "memory": memory_score,
                    "balanced": (throughput_score + memory_score) / 2,
                }[request.objective]

            items.sort(key=lambda item: (
                -item["score"], item["predicted_vram_gb"], -item["predicted_generation_tok_s"]
            ))
            return items

        candidates = rank(candidates)
        feasible = [item for item in candidates if item["fits_vram"] and item["meets_throughput"]]

        uncertainty = self.predictor.uncertainty_config
        vram_mae = uncertainty["vram"]["mae_gb"]
        throughput_mae = uncertainty["throughput"]["mae_tok_s"]
        ranked_all = [ConfigurationRecommendation(rank=index, vram_mae_gb=vram_mae,
                      throughput_mae_tok_s=throughput_mae, **candidate)
                      for index, candidate in enumerate(candidates, start=1)]
        ranked_feasible = [row.model_copy(update={"rank": index}) for index, row in enumerate(
            (row for row in ranked_all if row.fits_vram and row.meets_throughput), start=1
        )]
        warning = self.metadata["warning"]
        return RecommendationOutput(
            feasible_configurations=ranked_feasible,
            total_candidates_evaluated=len(self.model_sizes) * len(configurations),
            feasible_count=len(ranked_feasible),
            objective=request.objective,
            constraints={
                "available_vram_gb": request.available_vram_gb,
                "minimum_throughput_tok_s": request.minimum_throughput_tok_s,
                "context_tokens": request.context_tokens,
            },
            model_version=self.predictor.version,
            warning=warning,
            prediction_type="estimated",
            training_dataset="amd_llm_lab_master.csv",
            candidate_configurations=ranked_all,
        )
