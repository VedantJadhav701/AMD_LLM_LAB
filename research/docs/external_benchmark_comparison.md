# External Benchmark Comparison

Checked on 2026-10-02. External values are context only and are not merged into the AMD LLM Lab measurement CSV.

## Closest Qwen2.5 reference

The Qwen team's published Qwen2.5 speed benchmark reports batch-size-1 Transformer results on one NVIDIA A100 80 GB. Its shortest-input test uses input length 1 and generates 2,048 tokens. The local AMD LLM Lab rows below are Qwen2.5 BF16 measurements on one AMD Instinct MI300X at the nearest available context (512 tokens), with a different runtime stack and a different output-token count. The ratio is descriptive only, not a hardware speedup comparison.

| Model | AMD LLM Lab MI300X: tok/s, VRAM GB | Qwen published A100: tok/s, VRAM GB | Raw difference (speed, VRAM) |
|---|---:|---:|---:|
| Qwen2.5-0.5B BF16 | 77.02, 5.10 | 47.40, 0.97 | +62.5%, +426.2% |
| Qwen2.5-3B BF16 | 55.06, 9.96 | 30.80, 5.95 | +78.8%, +67.5% |
| Qwen2.5-7B BF16 | 66.78, 18.44 | 40.38, 14.38 | +65.4%, +28.2% |
| Qwen2.5-14B BF16 | 40.79, 31.82 | 24.74, 28.08 | +64.9%, +13.3% |
| Qwen2.5-32B BF16 | 30.01, 65.41 | 17.54, 61.58 | +71.1%, +6.2% |

The notably higher local VRAM measurements, particularly at 0.5B, warrant a methodology audit before making claims about memory efficiency. Possible causes to inspect include what each framework counts as peak allocated/reserved memory, startup/runtime overhead, context and output lengths, and measurement timing. This comparison alone cannot determine which measurement is correct.

## AMD-published references

AMD's ROCm MI300X inference guide documents Qwen2-7B rather than Qwen2.5-7B and uses eight GPUs with vLLM. Its throughput definition includes request concurrency and generated/input tokens. It is therefore not a direct single-GPU comparison with the local Transformers measurements.

The ROCm Model Automation and Dashboarding (MAD) SGLang example also describes multi-GPU MI300X tests, including a different 32B model (DeepSeek-R1-Distill-Qwen) and a separate serving workload. It is useful as a reproducibility reference, not as a same-model baseline.

MLPerf's public inference results include multi-accelerator MI300X systems and standardized workloads, but those entries do not provide an equivalent Qwen2.5 single-model, single-GPU configuration for this dataset.

## Interpretation

- The current public sources reviewed do not provide a fully like-for-like external result for these 57 Qwen2.5 measurements (same GPU count, model checkpoint, context/output lengths, backend, quantization implementation, and measurement method).
- Do not rank MI300X against A100 from the raw percentages above.
- Preserve the local CSV unchanged. Keep external figures in this comparison only, with their own source and methodology.
- For a valid comparison, rerun both stacks against the same model revision, prompt and generation lengths, batch/concurrency, warmup/repeats, memory metric, and timed section; record all software versions.

## Sources

- [Qwen2.5 speed benchmark](https://qwen.readthedocs.io/en/v2.5/benchmark/speed_benchmark.html)
- [AMD ROCm MI300X inference benchmark guide](https://rocm.docs.amd.com/en/docs-6.3.3/how-to/rocm-for-ai/inference/vllm-benchmark.html)
- [ROCm MAD SGLang benchmark procedure](https://github.com/ROCm/MAD/blob/develop/benchmark/sglang/README.md)
- [MLCommons Inference v5.1 results](https://docs.mlcommons.org/inference_results_v5.1/)
