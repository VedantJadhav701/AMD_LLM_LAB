# AMD LLM Lab Dashboard

Next.js frontend for AMD LLM Lab. The public research landing is `/`; the interactive local workspace is `/lab`, with Predictor, Recommender, Benchmark Explorer, My Device, Quantization Analysis, and Analytics.

## Public Site / Vercel

The landing page does not require the FastAPI service. Before development or production build, an npm script generates `public/data/amd_llm_lab_master.json` from the canonical `../backend/data/amd_llm_lab_master.csv`. The generated file contains only the source measured records and is ignored by Git; the CSV is never modified.

To deploy the public site, import the GitHub repository in Vercel, set **Root Directory** to `dashboard`, enable **Include source files outside of Root Directory in the Build Step**, use the Next.js framework preset, and build with `npm run build`. The build reads the canonical CSV from `backend/data/`, so Vercel must include files outside the dashboard root. The landing page and measured-data visualization work without a remote API. Interactive predictor, recommender, and local device routes require FastAPI, normally running on the visitor's computer. `GET /hardware/local` reports the FastAPI host only; it cannot inspect a visitor from Vercel.

## Run locally

From a fresh clone, create a Python virtual environment at the repository root and install backend requirements:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
cd backend
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

For macOS/Linux, activate with `source .venv/bin/activate` instead. In another terminal at the repository root, start the dashboard:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard uses `http://127.0.0.1:8000` by default. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to use another API address.

The API allows local cross-origin dashboard requests by default. For a remote API deployment, set `AMD_LLM_LAB_CORS_ORIGINS` on the API and `NEXT_PUBLIC_API_BASE_URL` for the dashboard.

The My Device page reads `GET /hardware/local`, which describes the FastAPI host. It cannot inspect a different machine when the API is remotely hosted. Missing benchmark combinations are labeled as estimates/interpolations, never as measured records.
