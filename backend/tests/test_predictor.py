from pathlib import Path

from src.predictor import Predictor
from src.schemas import PredictionInput


ROOT = Path(__file__).resolve().parents[1]


def test_prediction_has_nonnegative_values_and_uncertainty():
    result = Predictor(ROOT).predict(PredictionInput(
        parameters_b=7.615,
        context_tokens=4096,
        precision="INT4",
        quantization="qint4",
        backend="Transformers + Optimum Quanto",
    ))

    assert result.prediction.vram_gb > 0
    assert result.prediction.throughput_tok_s >= 0
    assert result.uncertainty.vram_mae_gb > 0
    assert result.model_version
    assert result.training_dataset == "amd_llm_lab_master.csv"
