from pathlib import Path

from src import hub
from src.advisor import AdviseRequest, advise
from src.fit import FitRequest, ModelSpec, estimate_fit


ROOT = Path(__file__).resolve().parents[1]


def test_kv_cache_uses_architecture_fields_and_prefill_reservation():
    base = dict(params_b=7.0, layers=32, head_dim=128, max_context_tokens=32768)
    request = FitRequest(
        spec=ModelSpec(kv_heads=4, hidden_size=4096, **base),
        precision="BF16", context_tokens=8192, batch_size=1, prefill_chunk_tokens=512,
        device_vram_gb=24,
    )
    gqa = estimate_fit(request, request.spec, "spec", "gqa")
    mha_spec = ModelSpec(kv_heads=32, hidden_size=4096, **base)
    mha_request = request.model_copy(update={"spec": mha_spec})
    mha = estimate_fit(mha_request, mha_spec, "spec", "mha")

    assert mha.kv_cache_gb > gqa.kv_cache_gb
    assert gqa.activation_buffer_gb > 0
    assert abs(gqa.total_gb - (gqa.weights_gb + gqa.kv_cache_gb + gqa.activation_buffer_gb + gqa.overhead_gb)) < 0.03


def test_advisor_gpu_lookup_returns_a_response(monkeypatch, tmp_path):
    monkeypatch.setenv("AMD_LLM_LAB_DB", str(tmp_path / "hub.sqlite"))
    hub.seed_reference(ROOT / "data" / "amd_llm_lab_master.csv")

    response = advise(AdviseRequest(
        vram_gb=192, gpu_name="MI300X", memory_bandwidth_gbps=5300,
        context_tokens=2048, batch_size=1, goal="fastest",
    ))

    assert response.considered > 0
    assert response.options
    assert response.measured_count >= 0


def test_hub_speed_summary_has_range(monkeypatch, tmp_path):
    monkeypatch.setenv("AMD_LLM_LAB_DB", str(tmp_path / "hub.sqlite"))
    hub.seed_reference(ROOT / "data" / "amd_llm_lab_master.csv")

    result = hub.measured_speed(
        "MI300X", "Qwen/Qwen2.5-7B-Instruct", "BF16", context=512, batch=1,
    )

    assert result is not None
    assert result["min"] <= result["median"] <= result["max"]
