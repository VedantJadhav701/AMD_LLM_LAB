import httpx
import pytest

import api.main as api


pytestmark = pytest.mark.asyncio


async def client(raise_app_exceptions=True):
    transport = httpx.ASGITransport(app=api.app, raise_app_exceptions=raise_app_exceptions)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_complete_api_route_contract():
    async with await client() as test_client:
        root = await test_client.get("/", follow_redirects=False)
        assert root.status_code == 307
        assert root.headers["location"] == "/docs"
        assert (await test_client.get("/favicon.ico")).status_code == 204

        health = await test_client.get("/health")
        assert health.status_code == 200
        assert health.json() == {"status": "ok", "model_version": "1.5.0", "dataset_rows": 57}

        models = await test_client.get("/models")
        assert models.status_code == 200
        assert len(models.json()) == 6

        hardware = await test_client.get("/hardware")
        assert hardware.status_code == 200
        assert hardware.json()["gpu"] == "AMD Instinct MI300X"

        local_hardware = await test_client.get("/hardware/local")
        assert local_hardware.status_code == 200
        local = local_hardware.json()
        assert local["host_scope"] == "fastapi_host"
        assert local["cpu"]["logical_cores"] >= 1
        assert "total_gb" in local["memory"]
        assert "available" in local["gpu"]

        benchmarks = await test_client.get("/benchmarks", params={"limit": 5})
        assert benchmarks.status_code == 200
        assert len(benchmarks.json()) == 5
        assert all("peak_vram_gb" in row and "generation_tok_s" in row for row in benchmarks.json())
        assert all(row["source_type"] == "measured" and row["source_id"] == "amd_llm_lab_master.csv" for row in benchmarks.json())
        assert all("confidence" not in row and "data_coverage" not in row for row in benchmarks.json())

        prediction = await test_client.post("/predict", json={
            "parameters_b": 7.615,
            "context_tokens": 4096,
            "precision": "INT4",
            "quantization": "qint4",
            "backend": "Transformers + Optimum Quanto",
        })
        assert prediction.status_code == 200
        prediction_body = prediction.json()
        assert prediction_body["prediction_type"] == "measured"
        assert prediction_body["source_type"] == "measured"
        assert prediction_body["training_dataset"] == "amd_llm_lab_master.csv"
        assert prediction_body["vram_source_type"] == "measured"
        assert prediction_body["throughput_source_type"] == "measured"
        assert prediction_body["prediction"]["vram_gb"] > 0
        assert prediction_body["prediction"]["throughput_tok_s"] >= 0
        assert prediction_body["model_version"] == "1.5.0"

        interpolated = await test_client.post("/predict", json={
            "parameters_b": 32.76,
            "context_tokens": 1024,
            "precision": "INT4",
            "quantization": "qint4",
            "backend": "Transformers + Optimum Quanto",
        })
        assert interpolated.status_code == 200
        assert interpolated.json()["prediction_type"] == "interpolated"
        assert interpolated.json()["source_count"] > 0
        assert "predictor_artifacts_v0.1.0" in interpolated.json()["source_id"]
        assert "estimation_v1.5.0" in interpolated.json()["source_id"]

        recommendation = await test_client.post("/recommend", json={
            "available_vram_gb": 24,
            "minimum_throughput_tok_s": 0,
            "context_tokens": 4096,
            "objective": "throughput",
        })
        assert recommendation.status_code == 200
        assert recommendation.json()["feasible_count"] > 0
        assert recommendation.json()["prediction_type"] == "estimated"
        assert recommendation.json()["training_dataset"] == "amd_llm_lab_master.csv"
        assert len(recommendation.json()["candidate_configurations"]) == 36

        metadata = await test_client.get("/metadata")
        assert metadata.status_code == 200
        assert metadata.json()["version"]["version"] == "1.5.0"

        evaluation = await test_client.get("/evaluation")
        assert evaluation.status_code == 200
        assert evaluation.json()["method"] == "Leave-One-Model-Out"


async def test_benchmarks_filter_by_supported_fields():
    async with await client() as test_client:
        response = await test_client.get("/benchmarks", params={
            "model": "Qwen2.5-7B",
            "parameters_b": 7,
            "precision": "INT4",
            "quantization": "qint4",
            "backend": "Transformers + Optimum Quanto",
            "context": 4096,
        })
        assert response.status_code == 200
        rows = response.json()
        assert rows
        assert all(row["precision"] == "INT4" for row in rows)
        assert all(row["quantization"] == "qint4" for row in rows)
        assert all(row["context_tokens"] == 4096 for row in rows)
        assert all(row["backend"] == "Transformers + Optimum Quanto" for row in rows)

        nominal_size = await test_client.get("/benchmarks", params={"parameters_b": 7})
        assert nominal_size.status_code == 200
        assert all(abs(row["parameters_b"] - 7) <= 0.7 for row in nominal_size.json())


async def test_request_validation_and_resource_errors():
    async with await client() as test_client:
        invalid_requests = [
            {"parameters_b": 0},
            {"parameters_b": 7.0},
            {"parameters_b": 7.0, "precision": "FP8"},
            {"parameters_b": 7.0, "backend": "Unknown backend"},
            {"parameters_b": 7.0, "context_tokens": -1},
            {"precision": "BF16"},
            {"parameters_b": 7.0, "precision": "INT4", "quantization": "none", "backend": "Transformers"},
        ]
        for body in invalid_requests:
            response = await test_client.post("/predict", json=body)
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "schema_validation_failed"

        unknown_model = await test_client.get("/benchmarks", params={"model": "not-a-benchmarked-model"})
        assert unknown_model.status_code == 404
        assert unknown_model.json()["error"]["code"] == "not_found"

        conflicting_context = await test_client.get("/benchmarks", params={"context": 512, "context_tokens": 1024})
        assert conflicting_context.status_code == 400
        assert conflicting_context.json()["error"]["code"] == "invalid_request"

        unknown_route = await test_client.get("/not-a-route")
        assert unknown_route.status_code == 404
        assert unknown_route.json()["error"]["code"] == "not_found"


async def test_unexpected_errors_return_sanitized_500(monkeypatch):
    def fail_prediction(request):
        raise RuntimeError("internal test detail")

    monkeypatch.setattr(api.predictor, "predict", fail_prediction)
    async with await client(raise_app_exceptions=False) as test_client:
        response = await test_client.post("/predict", json={
            "parameters_b": 7.615, "context_tokens": 4096,
            "precision": "INT4", "quantization": "qint4",
            "backend": "Transformers + Optimum Quanto",
        })
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"
        assert "internal test detail" not in response.text
