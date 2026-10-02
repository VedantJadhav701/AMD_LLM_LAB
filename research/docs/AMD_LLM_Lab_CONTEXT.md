# AMD LLM Lab --- Project Context

## 1. Project Identity

**Project name:** AMD LLM Lab

**Tagline:**\
\> Test. Predict. Optimize. Deploy.

**One-line description:**\
AMD LLM Lab is an AI/ML-driven platform that helps users determine
whether an LLM can run on their hardware, predict expected inference
performance, recommend an efficient configuration, and optionally
generate an experimental ultra-low-bit version when the original model
does not fit within available hardware resources.

**Primary positioning:**

> "Before downloading and configuring a large language model, find out
> how it is expected to perform on your machine --- and if it does not
> fit, find the most feasible compressed configuration."

The project should be **AMD-first**, but the architecture should remain
hardware-agnostic enough to support NVIDIA GPUs, Apple Silicon, CPUs,
and other accelerators later.

------------------------------------------------------------------------

# 2. Problem

Running local LLMs is becoming common, but users often have to manually
answer several questions:

-   Can this model fit in my GPU VRAM?
-   How much system RAM will I need?
-   Will the selected context length fit?
-   What quantization should I use?
-   What inference backend should I use?
-   What tokens/second can I realistically expect?
-   Will CPU offloading be necessary?
-   How much performance will be lost with aggressive quantization?
-   If the model does not fit at INT4, is there another feasible
    configuration?
-   Which model is best for a particular hardware constraint?

Current tools such as llama.cpp, Ollama, LM Studio, ROCm tooling, and
model repositories help users **run** models and/or **benchmark** them.

AMD LLM Lab should focus on the layer before and around deployment:

> **Predict → Recommend → Compress → Validate → Run**

The platform should reduce trial-and-error.

------------------------------------------------------------------------

# 3. Core User Story

A user has an AMD GPU with limited VRAM.

Example:

``` text
GPU: AMD Radeon / other supported accelerator
VRAM: 4 GB
System RAM: 16 GB
```

The user wants to run:

``` text
12B parameter LLM
```

The platform evaluates:

``` text
FP16
INT8
INT4
INT3
INT2
~1.58-bit / ternary-style experimental configurations
```

and considers:

``` text
GPU VRAM
System RAM
Model weights
KV cache
Context length
Runtime overhead
CPU/GPU offloading
Batch size
Concurrency
Backend
```

Example output:

``` text
FP16
❌ Does not fit

INT8
❌ Does not fit

INT4
⚠ Likely exceeds available VRAM

INT3
⚠ Possible with offloading

INT2
✓ Feasible

1.58-bit
✓ Experimental / feasible
```

The platform then recommends the configuration with the best expected
quality/performance trade-off.

------------------------------------------------------------------------

# 4. Core Product

AMD LLM Lab has four primary functions.

## 4.1 Compatibility Prediction

Answer:

> "Can this model run on my machine?"

Inputs:

-   model
-   parameter count
-   architecture
-   quantization
-   GPU
-   VRAM
-   system RAM
-   CPU
-   context length
-   batch size
-   concurrency
-   runtime/backend

Outputs:

-   fit / does not fit
-   estimated VRAM requirement
-   estimated RAM requirement
-   expected KV-cache usage
-   expected runtime overhead
-   possible CPU offloading
-   compatibility warnings

------------------------------------------------------------------------

## 4.2 Performance Prediction

Answer:

> "If I run it, how fast will it be?"

Predict:

-   time to first token (TTFT)
-   tokens/second
-   prompt processing speed
-   generation latency
-   memory consumption
-   throughput under concurrency

Predictions should preferably include an uncertainty range.

Example:

``` text
Estimated generation:
42–51 tokens/sec

Estimated TTFT:
160–220 ms
```

Do NOT present fabricated precision such as:

``` text
47.382 tokens/sec
```

unless the value comes from an actual benchmark.

------------------------------------------------------------------------

## 4.3 Configuration Recommendation

Answer:

> "What is the best configuration for my hardware?"

The system should consider:

``` text
Model
Quantization
Context
Batch
Concurrency
Backend
Offloading
Hardware
```

and recommend a configuration.

Example:

``` text
Recommended:

Model: Qwen 12B
Quantization: INT3
Context: 4096
GPU offload: partial
Backend: llama.cpp
Expected generation: 25–32 tok/s
Estimated memory: 3.7 GB VRAM + 6.2 GB RAM
```

Recommendations must be based on measured data or a clearly labeled
prediction model.

------------------------------------------------------------------------

# 5. "Make It Fit" Feature

This is a key differentiator.

When a model does not fit in the user's hardware, the platform should
not simply return:

``` text
Not supported.
```

Instead it should search for feasible alternatives.

Example:

``` text
User:
4 GB VRAM
16 GB RAM

Requested:
12B model
8K context
```

The system searches:

``` text
FP16
INT8
INT4
INT3
INT2
ultra-low-bit experimental mode
CPU/GPU offloading
```

and determines whether a feasible deployment exists.

The feature can be presented as:

> **Make It Fit**

Possible result:

``` text
Your selected model does not fit at INT4.

We found an experimental low-bit configuration
that may fit your hardware.

Recommended:
~1.58-bit / ternary-style weights
+
partial CPU offloading
+
4096 context

Estimated GPU memory:
~3.5 GB

Quality:
Experimental — evaluate before production use.
```

------------------------------------------------------------------------

# 6. Important Technical Qualification

The project must never imply:

> "Any model can be converted to 1-bit and will work normally."

This is technically incorrect.

Ultra-low-bit conversion can cause substantial quality degradation, and
arbitrary post-training conversion is not equivalent to a model trained
specifically for low-bit inference.

The platform must distinguish between:

1.  Native low-bit models
2.  Standard post-training quantization
3.  Experimental ultra-low-bit conversion
4.  Models trained specifically for low-bit inference

The UI should clearly label experimental results.

------------------------------------------------------------------------

# 7. Why \~1.58-bit Matters

The project may investigate ternary/ultra-low-bit approaches using
approximately 1.58 bits per weight, commonly associated with weights
represented using a small ternary set such as:

``` text
{-1, 0, +1}
```

This is related to research such as BitNet.

However:

-   theoretical weight memory is not the same as runtime memory
-   scales and metadata consume additional memory
-   KV cache still consumes memory
-   activations consume memory
-   runtime overhead exists
-   model quality can degrade
-   inference kernels must actually support the representation

Therefore, memory estimates must include more than:

``` text
parameters × bits / 8
```

------------------------------------------------------------------------

# 8. Target Hardware

## Primary target

AMD hardware.

Potential categories:

### AMD Radeon

Examples may include:

-   Radeon RX 7000 series
-   Radeon RX 9000 series
-   other supported Radeon GPUs

### AMD Instinct

Examples:

-   MI300X
-   other supported Instinct accelerators

### AMD Ryzen AI

Potential future support:

-   Ryzen AI systems
-   XDNA NPU-related workloads

The initial implementation should NOT attempt to support every AMD
device.

Start with a small, clearly documented hardware matrix.

------------------------------------------------------------------------

# 9. AMD Development Environment

The primary AMD backend should investigate:

-   ROCm
-   PyTorch on ROCm
-   llama.cpp with ROCm
-   vLLM where applicable
-   SGLang where applicable
-   AMD profiling/performance tools where appropriate

The project should treat existing inference engines as execution
backends rather than attempting to replace them.

Architecture:

``` text
                  AMD LLM Lab
                       |
             Prediction / Recommendation
                       |
              Configuration Generator
                       |
             +---------+---------+
             |                   |
          llama.cpp            vLLM
             |                   |
             +---------+---------+
                       |
                     ROCm
                       |
                  AMD Hardware
```

------------------------------------------------------------------------

# 10. Competitive Positioning

Relevant adjacent technologies/projects include:

-   llama.cpp
-   llama-bench
-   Ollama
-   LM Studio
-   ROCm tooling
-   vLLM
-   SGLang
-   model repositories and model cards
-   hardware benchmark databases

The project should NOT compete by becoming another LLM runner.

The differentiation is:

> **Predict performance and hardware feasibility before deployment,
> recommend a configuration, and provide an experimental path for models
> that exceed the user's hardware limits.**

The product sits above inference engines.

``` text
                  AMD LLM Lab
                       |
        +--------------+--------------+
        |              |              |
   Compatibility   Prediction    Optimization
        |              |              |
        +--------------+--------------+
                       |
               Recommended Setup
                       |
              +--------+--------+
              |                 |
          llama.cpp            vLLM
              |                 |
              +--------+--------+
                       |
                    ROCm
                       |
                  AMD Hardware
```

------------------------------------------------------------------------

# 11. ML Component

The project should contain a genuine machine-learning component.

Do not make the ML component decorative.

The initial performance prediction model can use:

### Hardware features

-   GPU architecture
-   VRAM
-   memory bandwidth
-   compute capability / relevant AMD hardware characteristics
-   CPU
-   system RAM

### Model features

-   parameter count
-   number of layers
-   hidden dimension
-   attention heads
-   vocabulary size
-   architecture
-   quantization
-   weight size

### Workload features

-   prompt length
-   context length
-   batch size
-   concurrency
-   generation length
-   backend

### Target variables

-   VRAM usage
-   TTFT
-   prompt processing throughput
-   generation tokens/sec
-   total latency
-   throughput under concurrency

Possible baseline models:

-   XGBoost
-   LightGBM
-   Random Forest
-   Gradient Boosting

A simple model with strong validation is preferable to a complicated
model with weak evidence.

------------------------------------------------------------------------

# 12. Benchmark Dataset

The platform needs real measurements.

Example schema:

``` text
model_name
model_family
parameter_count
architecture
quantization
quantization_type
context_length
batch_size
concurrency
backend
gpu_name
gpu_vram
system_ram
prompt_tokens
generation_tokens
ttft_ms
prompt_tokens_per_sec
generation_tokens_per_sec
total_latency_ms
peak_vram_mb
peak_ram_mb
timestamp
software_versions
```

Every benchmark record should also capture:

``` text
ROCm version
driver version
runtime version
backend version
model revision
benchmark configuration
```

This makes results reproducible.

------------------------------------------------------------------------

# 13. Prediction Pipeline

``` text
                 Benchmark Database
                         |
                         ▼
                Data Validation
                         |
                         ▼
                 Feature Engineering
                         |
                         ▼
                  ML Performance Model
                         |
                         ▼
               Validation / Calibration
                         |
                         ▼
                 Prediction API
                         |
                         ▼
                    Web UI
```

The model should output:

``` text
prediction
lower_bound
upper_bound
confidence / uncertainty
```

where technically appropriate.

------------------------------------------------------------------------

# 14. Benchmark Validation

Predictions must eventually be compared with real measurements.

Example:

``` text
                  Predicted       Actual
------------------------------------------------
Generation       42–51 tok/s     47.2 tok/s
TTFT             160–220 ms      191 ms
VRAM             3.4–3.8 GB      3.61 GB
```

Useful evaluation metrics:

### Regression

-   MAE
-   RMSE
-   MAPE
-   R²

### Interval prediction

-   coverage
-   interval width
-   calibration

The project should report prediction error honestly.

------------------------------------------------------------------------

# 15. Model Quality Evaluation

For aggressive quantization, performance alone is insufficient.

Evaluate model quality using task-appropriate benchmarks.

Potential evaluations:

-   perplexity
-   language modeling loss
-   instruction-following evaluation
-   coding evaluation
-   reasoning evaluation
-   domain-specific evaluation

The platform should show:

``` text
Memory
Performance
Quality
```

as separate dimensions.

Never invent a "quality %" without a defined evaluation methodology.

------------------------------------------------------------------------

# 16. Hardware Fit Engine

The fit engine should estimate:

``` text
Required memory =
weights
+ scales / quantization metadata
+ KV cache
+ activations
+ runtime overhead
```

A simplified conceptual formula:

``` text
total_memory =
    model_memory
  + kv_cache_memory
  + activation_memory
  + runtime_overhead
```

The engine should account for:

-   context length
-   batch size
-   number of layers
-   KV heads
-   head dimension
-   precision of KV cache
-   offloading
-   backend-specific overhead

The result should be an estimate, not a guarantee.

------------------------------------------------------------------------

# 17. User Interface

The UI should be simple.

## Step 1 --- Hardware

``` text
Select hardware

Vendor:
[ AMD ]

GPU:
[ RX 7900 XTX ]

VRAM:
[ 24 GB ]

System RAM:
[ 32 GB ]
```

## Step 2 --- Model

``` text
Select model

Qwen 3 8B
Llama 3.1 8B
Gemma
Mistral
...
```

## Step 3 --- Workload

``` text
Context:
[ 8192 ]

Batch:
[ 1 ]

Concurrency:
[ 1 ]
```

## Step 4 --- Results

``` text
Compatibility       ✓

Estimated VRAM     7.4 GB
Estimated RAM      5.2 GB

Generation         45–53 tok/s
TTFT               170–220 ms

Recommended:
Q4 configuration
```

## Step 5 --- Make It Fit

If the selected model does not fit:

``` text
This configuration exceeds your hardware.

Try:

[ INT3 ]
[ INT2 ]
[ Ultra-low-bit experimental ]
[ CPU offload ]
[ Reduce context ]

          ↓

[ Find feasible configuration ]
```

------------------------------------------------------------------------

# 18. "Model Finder" Feature

A later feature can reverse the workflow.

Instead of:

``` text
Model → Can I run it?
```

allow:

``` text
Hardware → What models can I run?
```

Example:

``` text
My hardware:

AMD GPU
8 GB VRAM
16 GB RAM

Goal:
Coding
≥ 30 tok/s
8K context
```

The system searches its model database and returns models/configurations
that are predicted to satisfy the constraints.

This can become one of the most useful features of the platform.

------------------------------------------------------------------------

# 19. Local Validation Agent

A lightweight local CLI can validate predictions.

Example:

``` bash
amdllm profile qwen3-8b
```

The tool detects:

``` text
GPU
VRAM
RAM
CPU
driver
ROCm
available backend
```

and sends only necessary benchmark metadata to the platform if the user
opts in.

Example:

``` bash
amdllm benchmark qwen3-8b --quant q4 --context 4096
```

Output:

``` text
AMD LLM Lab Benchmark

GPU: AMD Radeon ...
VRAM: 8 GB

Model: Qwen 3 8B
Quantization: Q4
Context: 4096

TTFT: 183 ms
Generation: 46.8 tok/s
Peak VRAM: 6.7 GB

Upload results? [y/N]
```

Privacy should be explicit.

------------------------------------------------------------------------

# 20. Privacy

The platform should not require users to upload model weights.

Prefer:

``` text
Model metadata
+
hardware metadata
+
benchmark results
```

rather than uploading:

``` text
large model files
```

If benchmark results are uploaded, clearly state what information is
collected.

Allow anonymous benchmark submission where practical.

------------------------------------------------------------------------

# 21. Cloud Architecture

Initial architecture:

``` text
Frontend
    |
    ▼
API
    |
    +------------------+
    |                  |
    ▼                  ▼
Prediction API    Benchmark DB
    |
    ▼
ML Model
```

Possible stack:

### Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS

### Backend

-   Python
-   FastAPI

### ML

-   PyTorch / scikit-learn
-   XGBoost or LightGBM

### Database

-   PostgreSQL

### Benchmark execution

-   AMD Developer Cloud
-   ROCm
-   containers

### Local execution

-   llama.cpp
-   vLLM
-   ROCm

The exact stack can change if technical constraints justify it.

------------------------------------------------------------------------

# 22. AMD Cloud Strategy

The developer does not own an AMD GPU.

Therefore:

### Local development

Use existing hardware for:

-   UI
-   API
-   database
-   prediction code
-   benchmark orchestration
-   model metadata
-   ML experimentation
-   unit tests

### AMD hardware

Use AMD Developer Cloud or other accessible AMD infrastructure for:

-   real ROCm benchmarks
-   profiling
-   benchmark dataset generation
-   model inference
-   AMD-specific validation

The project must clearly distinguish:

``` text
Measured on AMD hardware
```

from:

``` text
Predicted
```

and:

``` text
Simulated / estimated
```

------------------------------------------------------------------------

# 23. MVP

The first version should NOT implement everything.

### MVP requirements

1.  AMD hardware selector
2.  Model selector
3.  Hardware memory calculator
4.  Basic compatibility prediction
5.  Benchmark database
6.  Real AMD benchmark results
7.  Basic performance predictor
8.  Recommendation engine
9.  Simple web dashboard
10. GitHub repository with reproducible benchmark scripts

### MVP should NOT initially include

-   every AMD GPU
-   every LLM
-   automatic arbitrary 1-bit conversion
-   full cloud deployment
-   complex autonomous agents
-   every inference backend
-   every quantization format

Focus on correctness first.

------------------------------------------------------------------------

# 24. Phase 2

Add:

-   more AMD GPUs
-   more models
-   more quantization formats
-   llama.cpp integration
-   vLLM integration
-   local CLI
-   model finder
-   CPU offloading recommendations
-   confidence intervals
-   automated benchmark ingestion

------------------------------------------------------------------------

# 25. Phase 3

Add:

-   Make It Fit
-   ultra-low-bit experimental conversion
-   quality evaluation
-   automated quantization search
-   optimization under memory constraints
-   hardware-aware model recommendations
-   community benchmark submissions

------------------------------------------------------------------------

# 26. Research Direction

A potential technical paper title:

> **Hardware-Aware Performance Prediction and Resource-Constrained
> Deployment of Large Language Models on AMD Accelerators**

Alternative:

> **AMD LLM Lab: Learning to Predict and Optimize Local LLM Inference
> Under Hardware Constraints**

Research questions:

### RQ1

Can LLM inference latency and throughput be predicted from model,
workload, and hardware characteristics?

### RQ2

Can a learned performance model select an inference configuration better
than manual trial-and-error?

### RQ3

How does aggressive quantization affect the trade-off between memory,
latency, throughput, and model quality?

### RQ4

Can ultra-low-bit techniques enable useful inference for models that
exceed the native memory budget?

### RQ5

How accurately can performance be transferred across AMD hardware
generations?

------------------------------------------------------------------------

# 27. Success Metrics

The project should have measurable goals.

### Prediction

Target:

``` text
Low prediction error
Good interval coverage
```

The exact target should be established after collecting baseline data.

### Compatibility

Measure:

``` text
Predicted fit vs actual fit
```

### Optimization

Measure:

``` text
Baseline configuration
vs
Recommended configuration
```

### Compression

Measure:

``` text
Memory reduction
Latency change
Throughput change
Quality change
```

### User value

Measure:

``` text
Time saved before deployment
Number of tested configurations
Number of supported models
```

------------------------------------------------------------------------

# 28. What Makes the Project Interesting

The project is NOT:

> "A website that tells you how much VRAM an LLM needs."

It is:

> **An intelligent hardware-aware LLM deployment advisor that learns
> from real inference measurements and helps users find a feasible
> configuration under their hardware constraints.**

The core loop is:

``` text
Measure
   ↓
Learn
   ↓
Predict
   ↓
Recommend
   ↓
Compress / Optimize
   ↓
Run
   ↓
Measure again
```

This creates a continuously improving benchmark and prediction system.

------------------------------------------------------------------------

# 29. LinkedIn Positioning

The final public post should focus on the technical problem and
measurable result.

Possible headline:

> **I built AMD LLM Lab --- an AI-powered performance and deployment
> advisor for local LLMs.**

Key demonstration:

``` text
12B model
+
4 GB GPU

FP16  → ❌
INT8  → ❌
INT4  → ❌
Ultra-low-bit → experimental ✓
```

Then show:

``` text
Predicted vs Actual

Latency
VRAM
Tokens/sec
```

The post should emphasize real measurements and limitations.

Do not claim that every model can run on every GPU.

------------------------------------------------------------------------

# 30. Core Product Philosophy

The platform should always answer three questions:

### 1. Can I run it?

**Compatibility**

### 2. How will it run?

**Performance**

### 3. If it doesn't fit, what can I do?

**Optimization / compression**

The ultimate user journey:

``` text
                    USER
                      |
                      ▼
              Select hardware
                      |
                      ▼
                Select model
                      |
                      ▼
              Define workload
                      |
                      ▼
               AMD LLM LAB
                      |
          +-----------+-----------+
          |           |           |
          ▼           ▼           ▼
      FIT CHECK   PERFORMANCE   QUALITY
          |           |           |
          +-----------+-----------+
                      |
                      ▼
             RECOMMENDED SETUP
                      |
              Does not fit?
                      |
                     YES
                      |
                      ▼
                MAKE IT FIT
                      |
          +-----------+-----------+
          |           |           |
        INT3        INT2      Ultra-low-bit
          |           |           |
          +-----------+-----------+
                      |
                      ▼
              EXPERIMENTAL RUN
                      |
                      ▼
               LOCAL VALIDATION
                      |
                      ▼
                 REAL RESULT
```

------------------------------------------------------------------------

# 31. Guiding Principle

**Do not build another LLM runner.**

Build the intelligence layer that helps users decide:

> **Which model, precision, context, backend, and deployment
> configuration makes the most sense for the hardware they actually
> have?**

AMD should be the first-class platform for the project, with real AMD
measurements and ROCm-based validation.

The product should remain useful even when the user's hardware is too
weak for the original model --- because the system can investigate
compression, offloading, lower precision, or a smaller alternative
rather than simply returning "unsupported."
