from pathlib import Path

import pandas as pd

from src.estimator import EstimationEngine
from src.predictor import Predictor
from src.schemas import PredictionRequest


ROOT = Path(__file__).resolve().parents[1]


def test_exact_record_keeps_measured_and_predicted_metric_provenance_separate():
    dataset = pd.read_csv(ROOT / "data" / "amd_llm_lab_master.csv")
    row = dataset.iloc[0]
    request = PredictionRequest(
        parameters_b=float(row.parameters_b),
        context_tokens=int(row.context_tokens),
        precision=row.precision,
        quantization=row.quantization,
        backend=row.backend,
    )
    dataset.loc[0, "generation_tok_s"] = float("nan")

    result = EstimationEngine(Predictor(ROOT), dataset).estimate(request)

    assert result["source_type"] == "estimated"
    assert result["vram_source_type"] == "measured"
    assert result["throughput_source_type"] == "estimated"
    assert result["vram_gb"] == round(float(row.peak_vram_gb), 2)
    assert result["throughput_tok_s"] >= 0
    assert result["source_count"] == 1


def test_nearby_parameter_count_is_not_mislabeled_as_an_exact_measurement():
    dataset = pd.read_csv(ROOT / "data" / "amd_llm_lab_master.csv")
    row = dataset.iloc[0]
    request = PredictionRequest(
        parameters_b=float(row.parameters_b) + 0.01,
        context_tokens=int(row.context_tokens),
        precision=row.precision,
        quantization=row.quantization,
        backend=row.backend,
    )

    result = EstimationEngine(Predictor(ROOT), dataset).estimate(request)

    assert result["source_type"] in {"estimated", "interpolated"}
    assert result["vram_source_type"] != "measured"
    assert result["throughput_source_type"] != "measured"
