# AMD LLM Lab

**Independent LLM Inference Performance Research & Hardware Optimization Platform**

[![Repository](https://img.shields.io/badge/GitHub-VedantJadhav701%2FAMD__LLM__LAB-00c2de?logo=github)](https://github.com/VedantJadhav701/AMD_LLM_LAB)
[![Framework](https://img.shields.io/badge/Next.js-16.3.8-000000?logo=next.js)](https://nextjs.org/)
[![Backend](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AMD LLM Lab combines real AMD Instinct MI300X empirical measurements with predictive modeling and local device detection. It allows AI researchers and infrastructure engineers to analyze LLM VRAM requirements, generation throughput, quantization trade-offs, and system feasibility *before* executing model runs.

---

## 🏛️ Project Layout

```text
AMD_LLM_LAB/
├── backend/
│   ├── api/          # FastAPI REST endpoints & route controllers
│   ├── src/          # ML predictors, estimation engine, recommender, & schemas
│   ├── config/       # Model metadata and application configuration
│   ├── data/         # Empirical master benchmark dataset (amd_llm_lab_master.csv)
│   ├── evaluation/   # Held-out prediction reports and MAE metrics
│   ├── models/       # Trained Scikit-Learn predictor artifacts (.joblib)
│   └── tests/        # Pytest test suite for API and recommendation logic
├── dashboard/
│   ├── app/          # Next.js App Router (Landing, Lab Workspace, Benchmarks, Hardware)
│   ├── components/   # UI design system primitives, shell layout, and video scenes
│   ├── lib/          # API client and TypeScript contracts
│   ├── public/       # Three.js 3D WebGL scenes and static benchmark data snapshots
│   └── scripts/      # Static data build scripts (generate-public-data.mjs)
├── research/         # Source notebooks, analysis reports, & dataset provenance
└── index.html        # Standalone Meridian vintage engraved-illustration landing page
```

---

## ⚡ Key Features

- 📊 **Empirical MI300X Benchmarks**: 57+ direct observations covering model parameter sizes (8B to 70B+), precision modes (FP16, INT8, INT4), context lengths (512 to 32,768 tokens), and backend stacks.
- 🔮 **Predictive Estimation Engine**: Ridge & Random Forest regressors estimating VRAM overhead and token generation throughput for unmeasured configurations.
- 🎯 **Constraint-Driven Recommender**: Recommends optimal precision, batch size, and quantization formats based on target GPU VRAM budgets.
- 💻 **Local Hardware Device Probe**: Automatically scans local GPU memory, system RAM, CPU cores, and OS capabilities via FastAPI.
- 🎨 **AMD Brand Design System**: High-contrast dark & bright cream theme support inspired by `amd.com` with custom typography and Three.js / video scene assets.

---

## 🚀 Quick Start (Run Locally)

### 1. Clone the Repository
```bash
git clone https://github.com/VedantJadhav701/AMD_LLM_LAB.git
cd AMD_LLM_LAB
```

### 2. Start the Backend API (FastAPI)
```bash
cd backend

# Create & activate a Python virtual environment (Python 3.11 recommended)
python -m venv .venv
# On Windows:
.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Start FastAPI server on port 8000
uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```
> Interactive API documentation will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 3. Start the Frontend Dashboard (Next.js)
Open a second terminal window from the repository root:

```bash
cd dashboard

# Install Node dependencies
npm install

# Launch Next.js development server
npm run dev
```
> Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend automatically connects to the FastAPI backend.

---

## 🌐 Deploying to Vercel

To host the public landing page and static benchmark snapshot explorer on Vercel:

1. Push your repository to GitHub (`VedantJadhav701/AMD_LLM_LAB`).
2. Log in to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import the `VedantJadhav701/AMD_LLM_LAB` repository.
4. Set **Root Directory** to `dashboard`.
5. Under **Build & Development Settings**, enable `Include source files outside of Root Directory in the Build Step`.
6. Click **Deploy**.

---

## 🧪 Verification & Tests

### Backend Test Suite
```bash
cd backend
pytest -q
```

### Frontend Production Build
```bash
cd dashboard
npm run build
```

---

## 📝 Provenance & Research Disclaimers

- **Direct Observation**: Exact measured rows are explicitly marked `MEASURED`.
- **Model Predictions**: Estimated values from ML predictors are labeled `ESTIMATED` or `INTERPOLATED` with accompanying MAE statistics.
- **Disclaimer**: *AMD LLM Lab is an independent open-source research project and is not an official product of Advanced Micro Devices, Inc.*
