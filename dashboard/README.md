# AMD LLM Lab Dashboard

Next.js dashboard for the AMD LLM Lab FastAPI service. Workspaces: Overview, Predictor, Recommender, Benchmark Explorer, My Device, Quantization Analysis, and Analytics.

## Run locally

Start the API in one terminal from `AMD_LLM_LAB/`:

```powershell
conda run -n thermo_agent uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Start the dashboard in another terminal from `AMD_LLM_LAB/dashboard/`:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard uses `http://127.0.0.1:8000` by default. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to use another API address.

The API allows local cross-origin dashboard requests by default. For a deployed setup, set `AMD_LLM_LAB_CORS_ORIGINS` on the API to the dashboard origin.

The My Device page reads `GET /hardware/local`, which describes the FastAPI host. It cannot inspect a different machine when the API is remotely hosted. Missing benchmark combinations are labeled as estimates/interpolations, never as measured records.
