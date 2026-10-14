# AMD LLM Lab — Research Paper Results Dossier

**Working paper title:**  
**Beyond Parameter Count: Modeling LLM Inference Memory and Throughput on AMD Instinct MI300X**

**Alternative title:**  
*A Measurement-Driven Study of LLM Inference Performance Under Model Scale, Context, Precision, and Quantization*

**Project:** AMD LLM Lab v1  
**Dataset:** 57 measured configurations  
**Primary accelerator:** AMD Instinct MI300X (~192 GB HBM3)  
**Model family:** Qwen2.5 Instruct  
**Status:** Results foundation complete; experimental audit and final controlled re-benchmarking remain recommended before submission.

---

## 0. Scope and Evidence Status

This document consolidates the currently available experimental results, tables, statistical relationships, predictive-model evaluation, external-comparison notes, limitations, and proposed figures for the research paper.

### Evidence hierarchy

| Evidence type | Status | How it should be used |
|---|---|---|
| 57 local MI300X benchmark rows | **Measured** | Primary experimental evidence |
| EDA correlations | **Derived from measured data** | Exploratory analysis |
| Paired precision comparisons | **Derived from measured data** | Main quantization result |
| ML prediction evaluation | **Measured/derived evaluation** | Main predictive contribution |
| Recommender/estimator | **Engineering application** | Deployment-oriented contribution |
| External Qwen/A100 values | **External context** | Methodology discussion only; not merged into dataset |
| Qwen3.8-27B ultra-low-bit experiment | **Incomplete / paused** | Future work, not a paper result |
| Local RTX 3050 | **Device context** | Do not treat MI300X measurements as RTX 3050 performance |

### Important interpretation rule

The paper should **not** claim that lower precision universally reduces memory or increases throughput. The correct claim is narrower:

> Under the tested Qwen2.5 + Transformers/Optimum Quanto configurations on MI300X, lower-bit configurations showed implementation-dependent and sometimes counterintuitive memory and throughput behavior.

---

# 1. Research Questions

### RQ1 — Model scaling
How does parameter scale affect peak GPU memory and generation throughput on an AMD Instinct MI300X?

### RQ2 — Context scaling
How does input context length affect peak GPU memory and generation throughput?

### RQ3 — Precision and quantization
Does reducing numerical precision consistently reduce measured peak VRAM and improve generation throughput?

### RQ4 — Configuration-aware prediction
Can model size, context length, precision, quantization, backend, and GPU memory capacity be used to estimate memory and throughput for unseen configurations?

### RQ5 — Deployment decision support
Can the resulting empirical dataset and predictors support hardware-aware model/configuration selection without confusing measured results with estimates?

---

# 2. Experimental Setup

## 2.1 Hardware

| Property | Value |
|---|---|
| GPU | AMD Instinct MI300X VF |
| GPU memory | ~191.69 GB usable |
| Architecture | `gfx942:sramecc+:xnack-` |
| GPU vendor | AMD |
| Backend | ROCm |
| ROCm/HIP | 7.2.x / HIP 7.2.53211 |
| PyTorch | 2.11.0+gitd0c8b1f |
| Primary model runtime | Hugging Face Transformers |
| Quantized runtime | Transformers + Optimum Quanto |
| Dataset size | 57 measured configurations |

## 2.2 Models

The benchmark uses six Qwen2.5 Instruct model scales:

| Model | Parameters (approx.) |
|---|---:|
| Qwen2.5-0.5B-Instruct | 0.494B |
| Qwen2.5-1.5B-Instruct | 1.544B |
| Qwen2.5-3B-Instruct | 3.086B |
| Qwen2.5-7B-Instruct | 7.615B |
| Qwen2.5-14B-Instruct | 14.770B |
| Qwen2.5-32B-Instruct | 32.760B |

## 2.3 Tested precision/configuration families

- BF16
- FP16
- INT8
- INT4
- INT2

Context lengths:

- 512
- 1024
- 2048
- 4096
- 8192 tokens

Primary measured metrics:

1. Peak GPU VRAM
2. Generation throughput in tokens/second

Secondary stored metrics include:

- latency
- output token count
- memory per billion parameters
- tokens per GB
- VRAM utilization
- hardware
- GPU
- backend
- source file

---

# 3. Dataset Summary

The primary benchmark dataset contains **57 rows**, covering six model scales and multiple precision/quantization configurations on one MI300X.

| Dataset property | Result |
|---|---:|
| Total benchmark rows | **57** |
| Model sizes | **6** |
| Smallest model | **0.494B** |
| Largest model | **32.760B** |
| Context lengths | **5** |
| Precision/configuration families | **5** |
| GPU | **MI300X** |
| Missing latency rows | **10** |
| Duplicate benchmark rows | **0** |
| Negative numeric measurements | **0** |

The 10 missing latency values originate from the original 1.5B baseline data and are documented rather than imputed.

### Dataset columns

```text
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

### Dataset-design limitation

The dataset is **not a complete Cartesian factorial design** over model × precision × context × backend. Therefore, the paper should describe it as a **controlled but partially factorial benchmark dataset**, not as a full exhaustive grid.

---

# 4. Primary Measured Results

Across the 57 measured configurations:

| Metric | Observed range |
|---|---:|
| Peak VRAM | **4.20–68.77 GB** |
| Generation throughput | **4.27–78.32 tok/s** |
| Model scale | **0.494B–32.760B parameters** |
| Context | **512–8192 tokens** |

The central empirical observation is that model scale strongly structures memory demand, while throughput is jointly affected by model scale and implementation configuration.

---

# 5. Model-Scale Results

## 5.1 Scaling summary

Representative BF16 measurements at the shortest tested context (512 tokens) are:

| Model | Params | Peak VRAM (GB) | Throughput (tok/s) |
|---|---:|---:|---:|
| Qwen2.5-0.5B | 0.494B | 5.10 | 77.02 |
| Qwen2.5-3B | 3.086B | 9.96 | 55.06 |
| Qwen2.5-7B | 7.615B | 18.44 | 66.78 |
| Qwen2.5-14B | 14.770B | 31.82 | 40.79 |
| Qwen2.5-32B | 32.760B | 65.41 | 30.01 |

**Note:** These values are benchmark observations, not a complete model-size curve at identical software/runtime conditions for every model and every precision.

## 5.2 Correlations

| Relationship | Pearson correlation |
|---|---:|
| Parameters vs peak VRAM | **+0.835** |
| Parameters vs throughput | **−0.575** |
| Context vs peak VRAM | **+0.071** |
| Context vs throughput | **−0.174** |
| Throughput vs tokens/GB | **+0.817** |
| Peak VRAM vs tokens/GB | **−0.614** |

### Interpretation

The strongest simple relationship is between parameter count and peak VRAM.

This supports the intuitive expectation that larger models require more device memory, but the relationship is not perfectly linear because measured peak memory also contains runtime and implementation effects.

Throughput is less directly determined by parameter count. Precision, quantization method, backend behavior, and implementation overhead materially affect observed generation speed.

The weak context-to-VRAM correlation should **not** be interpreted as evidence that context length never affects memory. In this dataset, model size and configuration effects dominate the simple aggregate correlation. Context effects should therefore be examined using within-model/context plots rather than only a global correlation.

---

# 6. Precision and Quantization Results

## 6.1 Main paired comparison table

The following comparisons use paired context measurements between a lower-precision configuration and its higher-precision reference.

| Model | Comparison | Contexts | Avg VRAM change | Avg VRAM saved | Avg throughput change | Throughput ratio |
|---|---|---:|---:|---:|---:|---:|
| 1.5B | INT4 vs FP16 | 5 | **+10.779%** | −10.779% | **−62.299%** | 0.377× |
| 7B | INT2 vs BF16 | 5 | **−29.697%** | +29.697% | **−69.029%** | 0.310× |
| 7B | INT4 vs BF16 | 5 | **+29.970%** | −29.970% | **−70.012%** | 0.300× |
| 7B | INT8 vs BF16 | 5 | **+43.549%** | −43.549% | **−53.950%** | 0.460× |
| 14B | INT4 vs BF16 | 4 | **−38.901%** | +38.901% | **−72.173%** | 0.278× |
| 32B | INT4 vs BF16 | 4 | **−56.374%** | +56.374% | **−79.619%** | 0.204× |

## 6.2 Exact 1.5B INT4 vs FP16 measurements

| Context | FP16 VRAM GB | INT4 VRAM GB | FP16 tok/s | INT4 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 4.203 | 4.824 | 70.740 | 25.168 |
| 1024 | 4.373 | 4.886 | 67.147 | 25.720 |
| 2048 | 4.542 | 4.937 | 63.622 | 25.937 |
| 4096 | 4.713 | 5.010 | 61.115 | 25.123 |
| 8192 | 4.884 | 5.052 | 58.132 | 24.484 |

### Result

The INT4 implementation used here consumed approximately **10.8% more peak VRAM** than FP16 on average while producing approximately **62.3% lower generation throughput**.

This is an important result because it directly rejects the assumption that a lower-bit representation automatically translates into a lower measured runtime memory footprint and faster generation.

---

# 7. 7B Quantization Results

## 7.1 INT2 vs BF16

| Context | BF16 VRAM | INT2 VRAM | BF16 tok/s | INT2 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 18.440 | 13.148 | 66.781 | 20.238 |
| 1024 | 18.694 | 13.256 | 59.681 | 18.871 |
| 2048 | 19.039 | 13.381 | 54.725 | 17.970 |
| 4096 | 19.381 | 13.469 | 49.135 | 16.842 |
| 8192 | 19.872 | 13.606 | 43.849 | 16.384 |

Average result:

- VRAM: **−29.697%**
- Throughput: **−69.029%**

## 7.2 INT4 vs BF16

| Context | BF16 VRAM | INT4 VRAM | BF16 tok/s | INT4 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 18.440 | 24.438 | 66.781 | 19.558 |
| 1024 | 18.694 | 24.512 | 59.681 | 18.693 |
| 2048 | 19.039 | 24.641 | 54.725 | 18.093 |
| 4096 | 19.381 | 24.769 | 49.135 | 16.950 |
| 8192 | 19.872 | 24.896 | 43.849 | 15.839 |

Average result:

- VRAM: **+29.970%**
- Throughput: **−70.012%**

## 7.3 INT8 vs BF16

| Context | BF16 VRAM | INT8 VRAM | BF16 tok/s | INT8 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 18.440 | 27.005 | 66.781 | 31.385 |
| 1024 | 18.694 | 27.108 | 59.681 | 29.152 |
| 2048 | 19.039 | 27.228 | 54.725 | 27.049 |
| 4096 | 19.381 | 27.365 | 49.135 | 25.016 |
| 8192 | 19.872 | 27.486 | 43.849 | 22.903 |

Average result:

- VRAM: **+43.549%**
- Throughput: **−53.950%**

### Key 7B finding

The 7B results are especially useful for the paper because three lower-precision configurations behave very differently:

```text
BF16 → INT2:
    VRAM decreases
    throughput decreases strongly

BF16 → INT4:
    VRAM increases
    throughput decreases strongly

BF16 → INT8:
    VRAM increases further
    throughput decreases, but less severely than INT2/INT4
```

This demonstrates that **precision level alone is not a sufficient predictor of end-to-end inference behavior**.

---

# 8. 14B and 32B Quantization Results

## 8.1 14B INT4 vs BF16

| Context | BF16 VRAM | INT4 VRAM | BF16 tok/s | INT4 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 31.824 | 19.453 | 40.788 | 10.516 |
| 1024 | 32.341 | 19.825 | 36.420 | 9.682 |
| 2048 | 32.841 | 20.187 | 31.812 | 9.216 |
| 4096 | 34.117 | 20.877 | 24.985 | 8.565 |

Average result:

- VRAM: **−38.901%**
- Throughput: **−72.173%**

## 8.2 32B INT4 vs BF16

| Context | BF16 VRAM | INT4 VRAM | BF16 tok/s | INT4 tok/s |
|---:|---:|---:|---:|---:|
| 512 | 65.409 | 28.382 | 30.011 | 4.924 |
| 1024 | 66.300 | 28.855 | 26.907 | 4.703 |
| 2048 | 67.740 | 29.366 | 21.936 | 4.606 |
| 4096 | 66.981 | 29.229 | 22.156 | 4.606 |
| 8192 | 68.765 | 30.267 | 16.006 | 4.272 |

Average paired comparison reported from the available paired subset:

- VRAM: **−56.374%**
- Throughput: **−79.619%**

### Interpretation

For 14B and 32B, INT4 provides a substantial measured memory reduction but at a large throughput cost in the tested runtime.

Therefore, quantization should be framed as a **multi-objective trade-off**, not a one-dimensional optimization.

---

# 9. Context-Length Results

The benchmark uses:

```text
512 → 1024 → 2048 → 4096 → 8192 tokens
```

The aggregate correlations were:

| Target | Correlation with context |
|---|---:|
| Peak VRAM | +0.071 |
| Throughput | −0.174 |

The paired tables show that context increases generally correspond to modest VRAM growth and lower generation throughput, but the magnitude depends strongly on model and precision.

### Example: 1.5B FP16

| Context | Peak VRAM | Throughput |
|---:|---:|---:|
| 512 | 4.203 GB | 70.740 tok/s |
| 1024 | 4.373 GB | 67.147 tok/s |
| 2048 | 4.542 GB | 63.622 tok/s |
| 4096 | 4.713 GB | 61.115 tok/s |
| 8192 | 4.884 GB | 58.132 tok/s |

### Example: 7B BF16

| Context | Peak VRAM | Throughput |
|---:|---:|---:|
| 512 | 18.440 GB | 66.781 tok/s |
| 1024 | 18.694 GB | 59.681 tok/s |
| 2048 | 19.039 GB | 54.725 tok/s |
| 4096 | 19.381 GB | 49.135 tok/s |
| 8192 | 19.872 GB | 43.849 tok/s |

### Interpretation

Within the tested configurations, increasing context is associated with:

- increasing peak memory,
- decreasing generation throughput,

but these effects are much smaller than the differences caused by model size and quantization/backend configuration.

---

# 10. Efficiency Metrics

Two derived metrics are useful for the paper:

### Memory-normalized throughput

```text
tokens_per_gb = generation_tok_s / peak_vram_gb
```

Observed correlation:

| Relationship | Correlation |
|---|---:|
| Throughput vs tokens/GB | **+0.817** |
| VRAM vs tokens/GB | **−0.614** |

This supports a useful deployment perspective:

> A configuration should not be evaluated only by raw tokens/sec or raw VRAM. The relationship between throughput and memory footprint provides a more deployment-oriented efficiency measure.

---

# 11. Predictive Modeling

## 11.1 ML problem

Two regression targets were modeled:

1. `peak_vram_gb`
2. `generation_tok_s`

Input features:

```text
parameters_b
context_tokens
gpu_vram_gb
precision
quantization
backend
```

After categorical encoding:

**15 model features**

Target-leaking derived features were excluded.

## 11.2 Models

### VRAM predictor

The final v0.1 production-oriented predictor is a linear regression based primarily on model parameter scale.

### Throughput predictor

The final v0.1 production-oriented predictor uses an ExtraTrees regressor over the full configuration feature set.

---

# 12. Leave-One-Model-Out Evaluation

The evaluation holds out an entire model size rather than randomly splitting individual rows.

This is important because random row-level splitting could allow closely related context configurations from the same model to appear in both training and validation.

## 12.1 Results

| Target | Model | MAE | RMSE | R² |
|---|---|---:|---:|---:|
| Peak VRAM | ExtraTrees | **6.9135 GB** | 10.9038 GB | 0.5295 |
| Throughput | ExtraTrees | **11.9683 tok/s** | 13.4674 tok/s | **0.6627** |

### Interpretation

The throughput model generalizes better than the VRAM model under leave-one-model-out evaluation.

The VRAM predictor achieves moderate explanatory power but exhibits weak extrapolation at the largest held-out scale.

The most important failure case is the 32B model, where the learned VRAM relationship underpredicts the approximately 65–69 GB measured range.

This is a critical result and should be reported rather than hidden.

---

# 13. Fair Model Comparison

A fairer model comparison was also performed.

| Target | Model | MAE | RMSE | R² |
|---|---|---:|---:|---:|
| VRAM | Linear | 7.5827 GB | 10.5324 GB | 0.5610 |
| VRAM | Linear + Context | 7.5913 GB | 10.5336 GB | 0.5609 |
| VRAM | ExtraTrees | **6.9135 GB** | 10.9038 GB | 0.5295 |
| Throughput | Linear | 23.2343 tok/s | 26.2691 tok/s | −0.2834 |
| Throughput | ExtraTrees | **11.9683 tok/s** | 13.4674 tok/s | **0.6627** |

### Interpretation

For VRAM, the linear model performs competitively and has slightly better R² despite a higher MAE.

For throughput, ExtraTrees is substantially stronger than the linear baseline.

This suggests that throughput contains nonlinear interactions between model size, precision, quantization, backend, and context.

---

# 14. Configuration Ablation

## 14.1 Throughput

| Feature set | MAE (tok/s) | R² |
|---|---:|---:|
| Size + context | 18.05 | — |
| + precision | 17.10 | — |
| Full configuration | **12.01** | **0.657** |

The reduction from ~18 tok/s MAE to ~12 tok/s MAE shows that precision/configuration information materially improves throughput prediction.

## 14.2 VRAM

| Feature set | MAE (GB) | R² |
|---|---:|---:|
| Size + context | **6.63** | — |
| + precision | 6.98 | — |
| Full configuration | 6.75 | **0.536** |

For VRAM, model size is already highly informative, while configuration variables provide smaller incremental benefit.

### Main modeling conclusion

> Model size dominates memory prediction, while configuration details are substantially more important for throughput prediction.

---

# 15. Feature Importance

The ExtraTrees analysis showed:

### VRAM

Dominant feature:

- `parameters_b`

Secondary features:

- precision
- quantization
- backend
- context

### Throughput

Important features include:

- model size
- precision
- quantization
- backend
- context

The exact feature-importance plot should be regenerated from the final locked model artifact before paper submission.

---

# 16. Uncertainty and Deployment Interpretation

The production-oriented system stores:

- model predictions
- uncertainty metadata
- data coverage
- provenance
- recommender metadata

The application distinguishes:

### MEASURED

Exact configuration exists in the benchmark dataset.

### ESTIMATED

Configuration is not directly measured and is inferred from the predictive model.

### INTERPOLATED

Configuration is estimated from nearby measured configurations.

This distinction is scientifically important.

A predicted value must **never be displayed as a direct benchmark measurement**.

---

# 17. Deployment Decision Framework

The recommender should not use a binary rule:

```text
predicted VRAM > GPU VRAM → impossible
```

A more defensible classification is:

| Category | Meaning |
|---|---|
| GPU-fit | Predicted workload fits within the selected GPU memory budget with margin |
| GPU-tight | Configuration is near the memory limit |
| Offloadable | GPU memory is insufficient for pure GPU execution but CPU/RAM offload may be technically possible |
| Not practical | Predicted resource demand is too high for the target device/workload |

This is especially important for consumer devices such as an RTX 3050 4 GB laptop GPU.

The MI300X dataset should be used as an empirical benchmark anchor; it should **not** be presented as direct RTX 3050 performance.

---

# 18. External Benchmark Comparison

An external Qwen2.5 A100 80 GB reference was examined for methodology context.

| Model | Local MI300X tok/s | Local MI300X VRAM | Published A100 tok/s | Published A100 VRAM |
|---|---:|---:|---:|---:|
| 0.5B BF16 | 77.02 | 5.10 GB | 47.40 | 0.97 GB |
| 3B BF16 | 55.06 | 9.96 GB | 30.80 | 5.95 GB |
| 7B BF16 | 66.78 | 18.44 GB | 40.38 | 14.38 GB |
| 14B BF16 | 40.79 | 31.82 GB | 24.74 | 28.08 GB |
| 32B BF16 | 30.01 | 65.41 GB | 17.54 | 61.58 GB |

### Critical methodological warning

These numbers are **not apples-to-apples**.

The external benchmark uses a different:

- GPU
- runtime stack
- model execution configuration
- input length
- output-token count
- memory-accounting methodology

Therefore:

> **Do not claim that MI300X is faster than A100 based on this table.**

The unusually high local VRAM values, especially for the 0.5B model, motivate a benchmark-methodology audit.

The paper should explicitly separate:

1. local empirical measurements,
2. external contextual references,
3. direct hardware comparisons.

---

# 19. Recommended Measurement Audit Before Submission

Before final paper submission, repeat a representative subset using a locked protocol.

Record separately:

1. model-load memory,
2. prefill peak memory,
3. decode peak memory,
4. `torch.cuda.memory_allocated()`,
5. `torch.cuda.memory_reserved()`,
6. device-level memory if available,
7. warm-up runs,
8. synchronized timing,
9. number of repetitions,
10. prompt token count,
11. generated token count,
12. exact model revision,
13. exact Transformers/ROCm/PyTorch versions.

Recommended reporting:

```text
mean ± standard deviation
median
95% confidence interval
number of repetitions
```

This should become the final methodology standard for the paper.

---

# 20. Current Main Findings

## Finding 1 — Model scale strongly predicts memory demand

Parameter count correlates strongly with peak VRAM:

**r = +0.835**

The largest tested model, 32B, reached approximately 65–69 GB peak VRAM in BF16.

## Finding 2 — Throughput decreases with scale, but not monotonically

Parameter count has a moderate negative correlation with throughput:

**r = −0.575**

However, individual configurations can violate a simple size-only ordering because precision and runtime implementation matter.

## Finding 3 — Context length has a weaker aggregate effect

Aggregate correlations:

- context vs VRAM: **+0.071**
- context vs throughput: **−0.174**

Within-model tables show the expected directional effect more clearly than aggregate correlation.

## Finding 4 — Quantization is implementation-dependent

The most important result:

> Lower precision did not consistently produce lower measured VRAM or higher throughput.

Examples:

- 1.5B INT4 used **10.779% more VRAM** than FP16 and was **62.299% slower**.
- 7B INT4 used **29.970% more VRAM** than BF16 and was **70.012% slower**.
- 7B INT2 reduced VRAM by **29.697%** but reduced throughput by **69.029%**.
- 14B INT4 reduced VRAM by **38.901%** but reduced throughput by **72.173%**.
- 32B INT4 reduced VRAM by **56.374%** but reduced throughput by **79.619%**.

## Finding 5 — Configuration is important for throughput prediction

Full configuration features reduce throughput MAE from approximately **18.05 → 12.01 tok/s** in the ablation.

## Finding 6 — Memory prediction is dominated by model size

The VRAM model is substantially driven by `parameters_b`.

## Finding 7 — Prediction must include uncertainty and provenance

The deployment tool should explicitly distinguish:

```text
MEASURED
ESTIMATED
INTERPOLATED
```

This is necessary to prevent model-generated estimates from being interpreted as empirical measurements.

---

# 21. Figures Required for the Research Paper

The paper should prioritize **8–10 figures**.

## Figure 1 — Experimental framework

### Type
System/experimental pipeline diagram.

### Content

```text
Qwen2.5 Models
      ↓
Precision / Quantization
      ↓
Context-Length Sweep
      ↓
AMD Instinct MI300X
      ↓
VRAM + Throughput Measurements
      ↓
57-Row Dataset
      ↓
EDA
 ┌────┴────┐
 ↓         ↓
Scaling   Quantization
 ↓         ↓
Prediction Models
      ↓
Uncertainty / Recommender
```

### Purpose
Explain the complete research methodology.

---

## Figure 2 — Peak VRAM vs model parameters

### Type
Scatter plot + fitted trend.

- x-axis: parameters (B)
- y-axis: peak VRAM (GB)
- point shape: precision
- color: model size or precision
- annotate 0.5B, 1.5B, 3B, 7B, 14B, 32B

### Main result
Strong positive scaling relationship.

Report:

**r = 0.835**

---

## Figure 3 — Generation throughput vs model parameters

### Type
Scatter plot.

- x-axis: parameters (B)
- y-axis: tok/s
- marker: precision
- optionally facet by context

### Main result

Larger models generally generate more slowly, but configuration effects produce substantial spread.

Report:

**r = −0.575**

---

## Figure 4 — Context scaling

### Type
Two-panel line plot.

Panel A:
- context vs peak VRAM

Panel B:
- context vs throughput

Use separate lines for selected model/precision pairs.

Recommended highlighted configurations:

- 1.5B FP16
- 7B BF16
- 7B INT4
- 14B BF16
- 32B BF16

### Purpose
Show within-model context behavior instead of relying only on aggregate correlations.

---

## Figure 5 — Quantization trade-off

### Type
Paired slope/dumbbell plot.

For each model:

```text
BF16/FP16 → INT8/INT4/INT2
```

Panels:

A. VRAM change (%)

B. Throughput change (%)

### Main result

Quantization does not produce a universal monotonic improvement.

This should be one of the paper's central figures.

---

## Figure 6 — Pareto frontier: VRAM vs throughput

### Type
Scatter plot.

- x-axis: peak VRAM GB
- y-axis: generation tok/s
- point = benchmark configuration
- highlight Pareto-efficient configurations

### Purpose

Show that deployment decisions are multi-objective.

A configuration can be:

- memory-efficient but slow,
- fast but memory-heavy,
- balanced,
- dominated.

---

## Figure 7 — Prediction vs actual

### Type
Two-panel parity plot.

Panel A:
- actual VRAM vs predicted VRAM

Panel B:
- actual throughput vs predicted throughput

Add:

```text
y = x
```

and error statistics.

Report:

- VRAM MAE = 6.9135 GB
- VRAM R² = 0.5295
- Throughput MAE = 11.9683 tok/s
- Throughput R² = 0.6627

---

## Figure 8 — Leave-One-Model-Out error

### Type
Bar chart.

x-axis:

```text
0.5B
1.5B
3B
7B
14B
32B
```

y-axis:

- VRAM MAE
- throughput MAE

Use grouped bars.

### Critical observation

The 32B held-out model exposes the weakest VRAM extrapolation.

This figure is important for demonstrating honest generalization limits.

---

## Figure 9 — Feature importance

### Type
Horizontal bar chart.

Two panels:

A. VRAM predictor

B. Throughput predictor

Expected interpretation:

- `parameters_b` dominates VRAM
- precision/quantization/backend contribute strongly to throughput

---

## Figure 10 — Configuration ablation

### Type
Grouped bar chart.

Compare:

```text
Size + Context
Size + Context + Precision
Full Configuration
```

For:

- throughput MAE
- VRAM MAE

### Main result

Throughput prediction benefits strongly from configuration features.

---

# 22. Optional Supplementary Figures

## Supplementary Figure S1 — Full 57-row heatmap

Rows:

- model size

Columns:

- context

Separate heatmaps for:

- BF16 VRAM
- BF16 throughput
- INT4 VRAM
- INT4 throughput

## Supplementary Figure S2 — Memory efficiency

Scatter:

```text
peak VRAM vs tokens/GB
```

## Supplementary Figure S3 — Precision-specific context curves

One panel per model.

## Supplementary Figure S4 — Prediction residuals

Residual vs predicted value.

## Supplementary Figure S5 — Measurement methodology

Show memory accounting pipeline:

```text
model load
    ↓
warm-up
    ↓
prefill
    ↓
decode
    ↓
peak allocation
    ↓
peak reserved/device memory
```

---

# 23. Tables Required for the Paper

## Table 1 — Hardware/software configuration

Include:

- MI300X
- HBM capacity
- architecture
- ROCm
- PyTorch
- Transformers
- quantization backend
- measurement environment

## Table 2 — Benchmark dataset composition

Columns:

```text
Model
Parameters
Precision
Contexts
Number of Rows
Backend
```

## Table 3 — Model scaling summary

Columns:

```text
Model
Parameters
BF16 Peak VRAM
BF16 Throughput
```

## Table 4 — Precision/quantization paired results

Use the six-row paired comparison table from Section 6.

## Table 5 — Context scaling

Selected models at 512–8192.

## Table 6 — ML model comparison

Use:

```text
Target | Model | MAE | RMSE | R²
```

## Table 7 — Configuration ablation

Use throughput and VRAM ablation.

## Table 8 — External benchmark context

Include the A100 comparison only with a strong disclaimer that it is not directly comparable.

## Table 9 — Deployment recommendation categories

```text
GPU-fit
GPU-tight
Offloadable
Not practical
```

## Table 10 — Reproducibility checklist

Include:

- model revision
- software versions
- hardware
- context
- output length
- warmup
- repetitions
- synchronization
- memory metric
- timing metric

---

# 24. Proposed Paper Results Section Structure

## 4. Experimental Results

### 4.1 Dataset and benchmark coverage
Present Table 1–3.

### 4.2 Model scaling
Present Figure 2 and Figure 3.

Key statement:

> Peak VRAM increased strongly with model parameter count, while throughput showed a weaker inverse relationship and substantial configuration-dependent variation.

### 4.3 Context-length effects
Present Figure 4 and Table 5.

### 4.4 Quantization trade-offs
Present Figure 5, Figure 6, and Table 4.

Key statement:

> Lower precision did not uniformly improve memory or throughput under the tested runtime configurations.

### 4.5 Predictive modeling
Present Figure 7 and Table 6.

### 4.6 Generalization and ablation
Present Figure 8, Figure 9, Figure 10 and Table 7.

### 4.7 Deployment implications
Discuss provenance, uncertainty, and hardware-aware configuration selection.

---

# 25. Recommended Abstract-Level Results

A defensible results paragraph can state:

> We benchmarked 57 Qwen2.5 inference configurations spanning 0.494B to 32.760B parameters, context lengths of 512–8192 tokens, and BF16, FP16, INT8, INT4, and INT2 configurations on an AMD Instinct MI300X. Peak VRAM ranged from approximately 4.20 to 68.77 GB, while generation throughput ranged from 4.27 to 78.32 tokens/s. Parameter count showed a strong positive correlation with peak VRAM (r = 0.835), while its relationship with throughput was moderately negative (r = −0.575). Paired precision experiments revealed non-monotonic quantization behavior: for example, 7B INT4 reduced throughput by approximately 70.0% relative to BF16 while increasing measured peak VRAM by approximately 30.0%, whereas 14B and 32B INT4 reduced peak VRAM by approximately 38.9% and 56.4%, respectively, but also reduced throughput by approximately 72.2% and 79.6%. An ExtraTrees configuration-aware predictor achieved leave-one-model-out R² values of 0.5295 for peak VRAM and 0.6627 for throughput, with MAEs of 6.91 GB and 11.97 tokens/s, respectively.

**Important:** This paragraph should be updated after the final methodology audit and repeated measurements.

---

# 26. Core Contributions to Claim

The paper should claim four contributions.

### Contribution 1 — Controlled empirical characterization

A 57-row benchmark of Qwen2.5 inference behavior across model scale, context, precision, and quantization on MI300X.

### Contribution 2 — Empirical quantization trade-off analysis

Evidence that lower-bit inference does not automatically produce lower measured VRAM or higher throughput.

### Contribution 3 — Configuration-aware prediction

A predictive framework that separates memory scaling from throughput behavior and evaluates generalization using leave-one-model-out validation.

### Contribution 4 — Deployment-oriented interpretation

A hardware-aware framework that exposes measurement provenance and uncertainty instead of presenting estimates as empirical measurements.

---

# 27. What the Paper Must NOT Claim

Avoid the following claims.

### Do not claim:

> “MI300X is faster than A100.”

Reason: external benchmarks are not workload-equivalent.

### Do not claim:

> “INT4 always increases VRAM.”

Correct:

> Some tested INT4 implementations produced higher peak VRAM than their higher-precision reference configurations.

### Do not claim:

> “Quantization makes models slower.”

Correct:

> The tested quantized implementations were slower under the benchmark conditions.

### Do not claim:

> “Context length has no effect on VRAM.”

Correct:

> Aggregate correlation was weak, while within-model measurements showed context-dependent memory growth.

### Do not claim:

> “The model can predict any unseen LLM configuration.”

Correct:

> The predictor generalizes within the limited benchmark distribution and shows clear extrapolation error for some held-out model scales.

### Do not claim:

> “The dataset is a complete factorial benchmark.”

Correct:

> The dataset is a controlled, partially factorial benchmark covering selected model, precision, quantization, and context configurations.

### Do not claim:

> “The Qwen3.8 1-bit model was successfully published.”

The Qwen3.8 ultra-low-bit experiment is incomplete and paused.

---

# 28. Limitations

## 28.1 Single accelerator

The primary dataset is from one MI300X environment.

## 28.2 Single model family

All primary experiments use Qwen2.5 Instruct.

Cross-family generalization is not established.

## 28.3 Partial factorial coverage

Not every combination of model × precision × context × backend exists.

## 28.4 Missing latency

Ten rows lack latency values because the original 1.5B baseline did not contain them.

Latency should therefore not be the primary paper metric.

## 28.5 Memory-accounting uncertainty

The local measurements appear higher than some external Qwen reference measurements.

The reason may involve:

- allocated vs reserved memory,
- runtime overhead,
- model-loading memory,
- context/output differences,
- framework-specific accounting,
- measurement timing.

This needs an explicit audit.

## 28.6 Limited repetitions

The existing benchmark should be treated as the current measurement set, not as a final statistical characterization with strong confidence intervals.

A repeat-based re-benchmark is recommended.

## 28.7 Predictive extrapolation

The VRAM predictor underestimates the 32B held-out scale.

This demonstrates that extrapolation outside the observed model-size distribution is limited.

---

# 29. Required Final Experimental Upgrade

Before submission, perform a controlled re-benchmark on a representative subset.

### Recommended subset

| Model | Precision |
|---|---|
| 0.5B | BF16 |
| 1.5B | FP16 |
| 1.5B | INT4 |
| 7B | BF16 |
| 7B | INT2 |
| 7B | INT4 |
| 7B | INT8 |
| 14B | BF16 |
| 14B | INT4 |
| 32B | BF16 |
| 32B | INT4 |

Run each at:

```text
512
2048
8192
```

with multiple repetitions.

Record:

```text
warmup_count
repeat_count
prompt_tokens
output_tokens
prefill_time
decode_time
total_time
tokens_per_second
allocated_peak
reserved_peak
device_peak
model_load_memory
```

This audit would substantially strengthen the paper.

---

# 30. Statistical Reporting Upgrade

The final paper should report:

```text
mean
median
standard deviation
95% confidence interval
n
```

For paired precision comparisons:

- paired mean difference
- percentage change
- confidence interval
- optionally paired bootstrap confidence interval

For prediction:

- MAE
- RMSE
- R²
- residual distribution
- per-held-out-model error

---

# 31. Final Paper Figure Priority

If the paper allows only six main figures, use:

1. **Experimental framework**
2. **VRAM vs parameter count**
3. **Throughput vs parameter count**
4. **Quantization trade-off**
5. **VRAM/throughput Pareto frontier**
6. **Predicted vs actual + LOOMO error**

If eight figures are allowed, add:

7. **Context scaling**
8. **Feature importance / ablation**

---

# 32. Final Paper Table Priority

If the paper allows only six main tables:

1. Hardware/software setup
2. Dataset composition
3. Model scaling summary
4. Precision/quantization paired results
5. Prediction-model evaluation
6. Ablation/generalization

Put the complete 57-row benchmark table in supplementary material or repository data.

---

# 33. Supplementary Material

The supplementary package should contain:

```text
supplementary/
├── amd_llm_lab_master.csv
├── paired_precision_results.csv
├── quantization_summary.csv
├── out_of_fold_predictions.csv
├── uncertainty_by_model_size.csv
├── feature_schema.json
├── environment.json
├── model_metadata.json
├── benchmark_protocol.md
└── reproduction_commands.md
```

The GitHub repository should be treated as the reproducibility source of truth.

---

# 34. Reproducibility Checklist

Before submission, verify:

- [ ] Dataset checksum recorded
- [ ] Model revisions recorded
- [ ] GPU model recorded
- [ ] GPU memory recorded
- [ ] ROCm version recorded
- [ ] PyTorch version recorded
- [ ] Transformers version recorded
- [ ] Optimum Quanto version recorded
- [ ] Prompt construction recorded
- [ ] Context length recorded
- [ ] Output length recorded
- [ ] Warmup count recorded
- [ ] Repetition count recorded
- [ ] Synchronization method recorded
- [ ] Memory metric defined
- [ ] Timing metric defined
- [ ] Failed runs documented
- [ ] Missing latency documented
- [ ] External benchmark values separated from local data
- [ ] Prediction train/test protocol documented
- [ ] Random seeds documented
- [ ] Figures reproducible from saved data

---

# 35. Current Research Assessment

| Component | Assessment |
|---|---|
| Research question | **Strong** |
| Dataset | **Good foundation** |
| Model-scale analysis | **Strong** |
| Context analysis | **Useful but needs within-model analysis** |
| Quantization analysis | **Strong and interesting** |
| Predictive modeling | **Useful** |
| Generalization | **Moderate; 32B extrapolation is weak** |
| Statistical rigor | **Needs upgrade** |
| Cross-model generalization | **Missing** |
| Memory methodology audit | **Required** |
| Reproducibility | **Good foundation; protocol should be locked** |
| Paper potential | **Worth continuing** |

---

# 36. Final Research Narrative

The paper should tell the following story:

```text
Large language model deployment is constrained by two resources:
memory and inference throughput.

Parameter count explains a large part of memory demand,
but it does not fully explain practical inference behavior.

We therefore benchmarked 57 Qwen2.5 configurations on MI300X.

The measurements show:

    model scale
        ↓
    strong memory scaling

but:

    throughput
        ↓
    depends on scale + precision + quantization + backend

and:

    quantization
        ↓
    does not guarantee a better end-to-end system

We then built configuration-aware predictors.

The results show:

    VRAM prediction
        → strongly size-driven

    throughput prediction
        → benefits substantially from configuration features

Finally:

    empirical measurements
          +
    prediction
          +
    uncertainty
          +
    provenance
          ↓
    deployment-oriented decision support
```

This is the strongest version of the research narrative.

---

# 37. Recommended Final Paper Title

## Primary recommendation

**Beyond Parameter Count: Modeling LLM Inference Memory and Throughput on AMD Instinct MI300X**

### Subtitle, if needed

**A Measurement-Driven Study of Model Scale, Context Length, Precision, and Quantization**

---

# 38. One-Sentence Paper Claim

> **LLM inference performance on AMD accelerators cannot be reliably characterized by parameter count or nominal precision alone; empirical configuration-level measurements reveal substantial memory/throughput trade-offs that can be modeled for hardware-aware deployment.**

---

# 39. Final Status

### Completed

- [x] 57-row MI300X benchmark dataset
- [x] Six Qwen2.5 model scales
- [x] Multiple precision configurations
- [x] Context-length sweep
- [x] VRAM analysis
- [x] Throughput analysis
- [x] Precision-pair analysis
- [x] EDA correlations
- [x] Leave-one-model-out evaluation
- [x] Configuration ablation
- [x] VRAM predictor
- [x] Throughput predictor
- [x] Uncertainty/provenance framework
- [x] Recommender
- [x] Public AMD LLM Lab application
- [x] GitHub repository
- [x] Technical blog

### Required before paper submission

- [ ] Lock benchmark protocol
- [ ] Audit VRAM measurement methodology
- [ ] Repeat representative configurations
- [ ] Add mean ± std / confidence intervals
- [ ] Generate final figures from locked dataset
- [ ] Generate exact final table values directly from CSV
- [ ] Add stronger cross-model validation if compute permits
- [ ] Freeze software/model versions
- [ ] Write final Methods and Results sections
- [ ] Re-run all paper figures from the final data snapshot

### Separate future work

- [ ] Qwen3.8-27B ultra-low-bit final quantization
- [ ] IQ1_M / IQ1_S / IQ2_XS final artifacts
- [ ] Quantized-model quality evaluation
- [ ] Cross-model family benchmarking
- [ ] Additional AMD GPU benchmarking
- [ ] Community benchmark ingestion

The Qwen3.8-27B ultra-low-bit track should **not** be used as a completed result in the current paper.
