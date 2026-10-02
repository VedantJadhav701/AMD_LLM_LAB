from pathlib import Path

from src.recommender import Recommender
from src.schemas import RecommendationInput


ROOT = Path(__file__).resolve().parents[1]


def test_recommendations_obey_both_constraints_and_are_ranked():
    result = Recommender(ROOT).recommend(RecommendationInput(
        available_vram_gb=24,
        minimum_throughput_tok_s=10,
        context_tokens=4096,
        objective="throughput",
    ))

    assert result.total_candidates_evaluated == 36
    assert result.feasible_count == len(result.feasible_configurations)
    assert all(item.fits_vram and item.meets_throughput for item in result.feasible_configurations)
    assert [item.rank for item in result.feasible_configurations] == list(range(1, result.feasible_count + 1))
    assert result.warning


def test_recommender_returns_empty_list_when_constraints_are_impossible():
    result = Recommender(ROOT).recommend(RecommendationInput(
        available_vram_gb=1,
        minimum_throughput_tok_s=10000,
        objective="balanced",
    ))

    assert result.feasible_configurations == []
    assert result.feasible_count == 0
    assert len(result.candidate_configurations) == 36
    assert {row.source_type for row in result.candidate_configurations} <= {"measured", "estimated", "interpolated"}
    assert all(0 <= row.confidence <= 1 and 0 <= row.data_coverage <= 1 for row in result.candidate_configurations)


def test_recommendation_uses_measured_rows_and_returns_estimates_for_unmeasured():
    result = Recommender(ROOT).recommend(RecommendationInput(
        available_vram_gb=1, minimum_throughput_tok_s=10000, context_tokens=1024,
        objective="balanced",
    ))

    assert len(result.candidate_configurations) == 36
    assert any(row.source_type == "measured" for row in result.candidate_configurations)
    assert any(row.source_type in {"estimated", "interpolated"} for row in result.candidate_configurations)


def test_device_memory_budget_is_applied_to_every_candidate():
    result = Recommender(ROOT).recommend(RecommendationInput(
        available_vram_gb=8, minimum_throughput_tok_s=0, context_tokens=4096,
        objective="memory",
    ))

    assert len(result.candidate_configurations) == 36
    assert all(row.fits_vram == (row.predicted_vram_gb <= 8) for row in result.candidate_configurations)
    assert all(row.fits_vram for row in result.feasible_configurations)
