# AMD LLM Lab

AMD LLM Lab v1.5.0 is organized as a small monorepo: a FastAPI estimation service in `backend/` and a Next.js research dashboard in `dashboard/`.

## Project Layout

```text
backend/
  api/          FastAPI routes
  src/          predictors, estimation engine, recommender, schemas
  config/       model metadata and application configuration
  data/         source and derived research datasets
  evaluation/   held-out predictions and uncertainty reports
  models/       saved predictor artifacts
  tests/        API and model tests
dashboard/
  app/          Overview, Predictor, Recommender, Benchmarks, Device, Analysis
  components/   shared interface components
  lib/          API client and TypeScript contracts
research/
  data/         original inputs and feature/target matrices
  analysis/     derived metrics and prediction summaries
  notebooks/    research notebooks
  docs/         project plan and handoff context
  archives/     source archive and preserved workspace residue
```

The empirical master benchmark remains `backend/data/amd_llm_lab_master.csv`. The estimation layer does not modify source observations; unmeasured configurations carry explicit provenance, confidence, and coverage metadata.

## Run Locally

Start the API from `backend/`:

```powershell
Set-Location backend
conda run -n thermo_agent pip install -r requirements.txt
conda run -n thermo_agent uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Start the dashboard from `dashboard/` in another terminal:

```powershell
Set-Location dashboard
npm install
npm run dev
```

Open `http://localhost:3000`; the API reference is at `http://127.0.0.1:8000/docs`. Set `NEXT_PUBLIC_API_BASE_URL` in `dashboard/.env.local` when using a different API address.

## Checks

```powershell
Set-Location backend
conda run -n thermo_agent pytest
Set-Location ..\dashboard
npm run lint
npm run build
```

See [backend/README.md](backend/README.md) and [dashboard/README.md](dashboard/README.md) for API contracts, interpretation notes, and service details.
