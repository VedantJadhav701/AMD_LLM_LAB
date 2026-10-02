# AMD LLM Lab v1 --- Project Plan

## 1. Project Status

### AMD LLM Lab v1 --- COMPLETE

The core AMD LLM Lab v1 work is complete and preserved locally.

Completed: - AMD Instinct MI300X benchmarking - Multiple Qwen model
sizes and precision configurations - BF16, FP16, INT8, INT4 and INT2
experiments - Context-length benchmarking - VRAM and
generation-throughput measurements - Master benchmark dataset - EDA and
correlation analysis - Precision-pair comparisons - Leave-One-Model-Out
evaluation - Configuration ablation - VRAM prediction model - Throughput
prediction model - Uncertainty analysis - Recommender metadata -
Reproducible configuration and model artifacts

### Qwen3.8-27B ultra-low-bit track --- PAUSED

This is a separate experimental extension and is **not complete**.

Validated: 1. Qwen3.8-27B F16 GGUF conversion. 2. Qwen3.5/Qwen3.8 MTP
loader correction. 3. Loading of regular `blk.64` MTP decoder tensors.
4. iMatrix coverage for `blk.0` through `blk.63`. 5. Preservation of
`blk.64` in F16/F32 during quantizer dry-run. 6. Mixed-precision IQ1_M
dry-run estimate of approximately 8.08 GiB and 2.48 effective BPW.

Not completed: - Final IQ1_M GGUF - IQ1_S GGUF - IQ2_XS GGUF - Final
MI300X benchmark of the quantized artifacts - Quality evaluation -
Hugging Face publication

The AMD Developer Academy environment was blocked during the
long-running quantization experiment. Do not bypass the block; resume
only through an approved compute environment.

------------------------------------------------------------------------

# 2. Local Project Structure

Root:

``` text
C:\Users\HP\projects\AMD_LLM_Lab\AMD_LLM_LAB_v1\AMD_LLM_LAB
```

Required directories:

``` text
AMD_LLM_LAB/
├── config/
├── data/
├── evaluation/
├── models/
├── notebooks/
└── README.md
```

Expected artifacts:

``` text
config/
├── feature_schema.json
├── model_metadata.json
├── uncertainty.json
├── recommender_metadata.json
├── version.json
├── environment.json
└── dataset_summary.json

data/
└── amd_llm_lab_master.csv

evaluation/
├── out_of_fold_predictions.csv
└── uncertainty_by_model_size.csv

models/
├── vram_predictor.joblib
└── throughput_predictor.joblib
```

------------------------------------------------------------------------

# 3. Benchmark Dataset

Primary dataset:

`data/amd_llm_lab_master.csv`

Current characteristics: - 57 benchmark rows - 6 model sizes - AMD
Instinct MI300X - Contexts: 512, 1024, 2048, 4096 and 8192 tokens -
BF16, FP16, INT2, INT4 and INT8 configurations - 10 rows have missing
latency because the original 1.5B baseline did not contain latency

Important columns:

``` text
model
parameters_b
precision
quantization
context_tokens
output_tokens
latency_s
generation_tok_s
peak_vram_gb
memory_per_billion_params_gb
tokens_per_gb
vram_utilization_pct
hardware
gpu
gpu_vram_gb
backend
source_file
```

Data checks completed: - No duplicate benchmark rows - No negative
numeric measurements - Missing latency documented - Target-leaking
derived features excluded from ML

------------------------------------------------------------------------

# 4. EDA

Recorded correlations:

  Relationship                    Correlation
  ----------------------------- -------------
  parameters vs VRAM                    0.835
  parameters vs throughput             -0.575
  context vs VRAM                       0.071
  context vs throughput                -0.174
  throughput vs tokens_per_gb           0.817
  VRAM vs tokens_per_gb                -0.614

Interpretation: - Parameter count is the strongest simple predictor of
peak VRAM. - Throughput depends on model size plus precision,
quantization and backend behavior. - Context length showed only a weak
relationship with measured peak VRAM in this benchmark.

------------------------------------------------------------------------

# 5. Precision Analysis

Recorded paired comparisons:

  Model   Comparison       VRAM change   Throughput change
  ------- -------------- ------------- -------------------
  1.5B    INT4 vs FP16        +10.779%            -62.299%
  7B      INT2 vs BF16        -29.697%            -69.029%
  7B      INT4 vs BF16        +29.970%            -70.012%
  7B      INT8 vs BF16        +43.549%            -53.950%
  14B     INT4 vs BF16        -38.901%            -72.173%
  32B     INT4 vs BF16        -56.374%            -79.619%

Required interpretation:

> Lower precision does not automatically mean lower measured VRAM or
> higher throughput.

The observed behavior is backend- and implementation-dependent.

------------------------------------------------------------------------

# 6. ML Modeling

Features:

``` text
parameters_b
context_tokens
gpu_vram_gb
precision
quantization
backend
```

After encoding, the feature set contains 15 features.

Targets:

``` text
peak_vram_gb
generation_tok_s
```

Target-leaking variables must not be included.

------------------------------------------------------------------------

# 7. Validation Results

## Leave-One-Model-Out

### VRAM

``` text
MAE  = 6.9135 GB
RMSE = 10.9038 GB
R²   = 0.5295
```

### Throughput

``` text
MAE  = 11.9683 tok/s
RMSE = 13.4674 tok/s
R²   = 0.6627
```

The 32B model is a difficult VRAM extrapolation case.

------------------------------------------------------------------------

# 8. Configuration Ablation

## Throughput

  Features                       MAE
  -------------------- -------------
  size + context         18.05 tok/s
  \+ precision           17.10 tok/s
  full configuration     12.01 tok/s

Full configuration:

``` text
R² ≈ 0.657
```

## VRAM

  Features                     MAE
  -------------------- -----------
  size + context         ≈ 6.63 GB
  \+ precision           ≈ 6.98 GB
  full configuration     ≈ 6.75 GB

Full configuration:

``` text
R² ≈ 0.536
```

The production VRAM predictor should remain conservative rather than
claiming unsupported configuration-specific corrections.

------------------------------------------------------------------------

# 9. Production Models

## `models/vram_predictor.joblib`

Current v0.1.0 design:

``` text
LinearRegression
parameters_b → peak_vram_gb
```

## `models/throughput_predictor.joblib`

Current design:

``` text
ExtraTrees
```

Uses the complete configuration feature set.

Recorded LOOMO performance:

``` text
R² ≈ 0.657
MAE ≈ 12.01 tok/s
```

------------------------------------------------------------------------

# 10. Evaluation Artifacts

`evaluation/out_of_fold_predictions.csv`

Purpose: - Error analysis - Residual analysis - Model-size comparison -
Reproducibility

`evaluation/uncertainty_by_model_size.csv`

Purpose: - Model-size uncertainty analysis - Extrapolation-risk
communication

------------------------------------------------------------------------

# 11. Configuration Artifacts

`config/feature_schema.json` - Input feature schema

`config/model_metadata.json` - Predictor metadata

`config/uncertainty.json` - Uncertainty information

`config/recommender_metadata.json` - Recommender configuration

`config/version.json` - Current release: `v0.1.0`

`config/environment.json` - Benchmark environment

`config/dataset_summary.json` - Dataset statistics and provenance

------------------------------------------------------------------------

# 12. Recommender

Inputs:

``` text
available_vram
minimum_throughput
objective
```

Process:

1.  Filter configurations exceeding available VRAM.
2.  Filter configurations below the required throughput.
3.  Rank the remaining configurations according to the requested
    objective.
4.  Expose uncertainty where available.
5.  Clearly distinguish predicted values from measured values.

Do not invent configuration-specific VRAM corrections.

------------------------------------------------------------------------

# 13. MI300X Benchmark Environment

Recorded environment:

``` text
GPU:
AMD Instinct MI300X

Usable VRAM:
~191.69 GB

Architecture:
gfx942

ROCm:
7.2.x

PyTorch:
2.11.0+gitd0c8b1f
```

------------------------------------------------------------------------

# 14. Qwen3.8-27B Ultra-Low-Bit Extension

Objective:

``` text
Qwen3.8-27B F16
       ↓
Importance Matrix
       ↓
IQ2_XS / IQ1_S / IQ1_M
       ↓
MI300X Benchmark
       ↓
Quality Evaluation
```

Scientific distinction:

Do not claim the complete model is exactly 1-bit.

IQ1_M is a 1-bit-class GGUF format, while the complete mixed model has
an effective BPW determined by its actual tensor composition.

------------------------------------------------------------------------

# 15. Qwen3.8 MTP Handling

The model reports:

``` text
n_layer     = 64
n_layer_all = 65
```

The additional MTP block is:

``` text
blk.64
```

Standard iMatrix execution covered:

``` text
blk.0 → blk.63
```

and did not produce statistics for `blk.64`.

Therefore, statistics for `blk.64` must not be fabricated.

The loader was patched so the regular MTP decoder tensors are loaded
correctly.

The quantizer was then patched to preserve:

``` text
blk.64.*
```

in original F16/F32 precision.

Final intended composition:

``` text
blk.0–63 → ultra-low-bit quantization
blk.64    → F16/F32
```

------------------------------------------------------------------------

# 16. Verified Qwen3.8 Dry Run

Dry-run results:

``` text
Original:
~52,115 MiB

Estimated quantized:
~8,077 MiB

Effective estimated BPW:
~2.48
```

The dry run showed: - `blk.0–63` being quantized - `blk.64` remaining
F16/F32

This is a validated dry-run result, not a completed final model.

------------------------------------------------------------------------

# 17. Compute Environment Incident

The Qwen3.8 experiment was executed on AMD Developer Academy shared
Jupyter infrastructure.

The environment subsequently reported an account security block.

Actions: - Do not bypass the block. - Do not create alternate accounts
to circumvent it. - Do not use detached/background GPU jobs unless AMD
explicitly permits them. - Contact AMD through the support/Discord
channel shown on the block page. - Ask which workload/resource policy
was triggered. - Ask whether an approved batch/job mechanism exists for
long-running quantization.

------------------------------------------------------------------------

# 18. Next Phase

When approved compute access is available:

## Phase A --- Quantization

Generate:

``` text
IQ2_XS
IQ1_S
IQ1_M
```

For each artifact record:

``` text
file size
effective BPW
tensor-type distribution
preserved tensors
conversion time
peak VRAM
```

## Phase B --- MI300X inference benchmark

Measure:

``` text
prompt processing tok/s
generation tok/s
time-to-first-token
peak VRAM
steady-state VRAM
context length
```

Contexts:

``` text
512
1024
2048
4096
8192
```

Use identical prompts and generation settings.

## Phase C --- Quality evaluation

Compare:

``` text
F16
IQ2_XS
IQ1_S
IQ1_M
```

Evaluation categories:

``` text
general reasoning
instruction following
factual QA
long-context behavior
coding
mathematical reasoning
```

Report:

``` text
absolute score
relative degradation from F16
latency
VRAM
model size
```

## Phase D --- AMD-specific analysis

Study:

``` text
quantization level
        ×
MI300X memory
        ×
MI300X throughput
        ×
quality degradation
        ×
effective BPW
```

The useful research contribution is the measured memory/latency/quality
trade-off on AMD hardware, rather than simply claiming creation of a
1-bit model.

------------------------------------------------------------------------

# 19. Final Target Repository

``` text
AMD_LLM_LAB/
│
├── config/
│   ├── feature_schema.json
│   ├── model_metadata.json
│   ├── uncertainty.json
│   ├── recommender_metadata.json
│   ├── version.json
│   ├── environment.json
│   └── dataset_summary.json
│
├── data/
│   ├── amd_llm_lab_master.csv
│   └── qwen_quantization_results.csv
│
├── evaluation/
│   ├── out_of_fold_predictions.csv
│   ├── uncertainty_by_model_size.csv
│   ├── quantization_benchmark.csv
│   └── quality_evaluation.csv
│
├── models/
│   ├── vram_predictor.joblib
│   └── throughput_predictor.joblib
│
├── notebooks/
│   ├── 01_benchmark_collection.ipynb
│   ├── 02_eda.ipynb
│   ├── 03_modeling.ipynb
│   ├── 04_evaluation.ipynb
│   └── 05_qwen_quantization_analysis.ipynb
│
└── README.md
```

------------------------------------------------------------------------

# 20. Final Research Question

The complete AMD LLM Lab should answer:

> **How do model size, precision, quantization strategy, context length
> and backend configuration affect memory consumption, inference
> throughput and model quality on AMD accelerator hardware?**

The project combines:

``` text
Benchmarking
    +
EDA
    +
Predictive Modeling
    +
Configuration Recommendation
    +
Ultra-Low-Bit Quantization
    +
Quality/Performance Evaluation
```

The existing AMD LLM Lab v1 benchmark/prediction system is the stable
completed foundation. The Qwen3.8-27B quantization work is an
experimental extension that should be resumed only on an approved
compute environment.
