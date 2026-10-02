# AMD LLM Lab

AMD LLM Lab v1.5.0 is a local FastAPI service and responsive dashboard for inference planning. It wraps the saved v0.1.0 VRAM and throughput predictor artifacts with an empirical estimation/provenance layer and exposes the benchmark dataset used by the research project.

## Start the API

From this directory, install the dependencies into the `thermo_agent` Conda environment (or an equivalent Python environment), then start the service:

```powershell
conda run -n thermo_agent pip install -r requirements.txt
conda run -n thermo_agent uvicorn api.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive API reference.

Set `AMD_LLM_LAB_CORS_ORIGINS` to a comma-separated list of dashboard origins when serving a separate frontend. It defaults to `*` for local development.

## Endpoints

- `POST /predict` predicts peak VRAM and generation throughput for a supplied configuration. Responses identify the estimates, model version, and training dataset.
- `POST /recommend` ranks all 36 supported model/stack candidates by `throughput`, `memory`, or `balanced`. Feasible choices remain in `feasible_configurations`; `candidate_configurations` also carries infeasible alternatives so clients can explain near misses. Each candidate includes provenance and confidence.
- `GET /models` lists benchmarked models and their measured configuration coverage.
- `GET /hardware` returns the recorded MI300X environment.
- `GET /hardware/local` inspects the machine running FastAPI, with graceful CPU/RAM/GPU fallbacks. It does not inspect a remote browser's computer.
- `GET /benchmarks` returns measured records; optional filters are `model`, `parameters_b`, `precision`, `quantization`, `backend`, and `context` (with `context_tokens` accepted as a compatibility alias). Parameter size filters match within 10% to support nominal labels such as `7` for the measured 7.615B model. Results use `limit` (maximum 1000) and `offset` pagination.
- `GET /health` reports service and dataset status.
- `GET /metadata` returns model, feature, version, and recommender metadata.
- `GET /evaluation` returns the recorded leave-one-model-out metrics.

Request bodies reject unknown fields and unsupported precision/backend combinations. Validation errors return 422, contradictory context filters return 400, unknown models or model sizes return 404, and unexpected failures return a sanitized 500 response. API errors use `{ "error": { "code": "...", "message": "..." } }` with validation details when available.

## Tests

```powershell
conda run -n thermo_agent pytest
```

## Interpretation

The dataset contains 57 MI300X benchmark observations and is not modified by the estimation layer. An exact model/precision/quantization/backend/context match is returned as `measured` with `source_id=amd_llm_lab_master.csv`. Missing combinations use the saved predictors calibrated against nearby empirical rows and are labeled `estimated` or `interpolated`; every result includes confidence, data coverage, and supporting row count. These coverage values describe empirical support, not a probability of correctness.

VRAM predictions retain a parameter-size baseline and may be calibrated from nearby same-model measurements; throughput uses the full configuration feature set and nearby residual calibration. Recommendation constraints use the supplied VRAM capacity, while all performance estimates remain MI300X-calibrated. `GET /hardware/local` reports the FastAPI host, not a remote browser client, and GPU memory can remain unavailable when vendor telemetry is missing. Validate deployment decisions with real inference measurements.

## Dashboard

The responsive dark-first Next.js app includes Overview, Predictor, Recommender, Benchmark Explorer, My Device, Quantization Analysis, and Analytics. Start it from `dashboard/`; measured rows and estimated configurations are shown in separate views with explicit provenance.
