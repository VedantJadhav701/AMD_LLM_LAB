# 🗺️ AMD LLM Lab Project Roadmap

This roadmap outlines the milestones, upcoming features, and long-term vision for **AMD LLM Lab**. Our goal is to build the definitive open-source platform for predicting, profiling, benchmarking, and optimizing Large Language Model inference across AMD hardware and heterogeneous systems.

> 🌟 **Want to influence our roadmap?** [Star the repo](https://github.com/VedantJadhav701/AMD_LLM_LAB) and share your thoughts in [GitHub Discussions](https://github.com/VedantJadhav701/AMD_LLM_LAB/discussions)!

---

## 📍 Milestones & Progress

```
[====== Completed ======]  Phase 1: Core Physics Engine & Desktop App (v0.1.0)
[=== In Progress ===    ]  Phase 2: Native AMD ROCm & Ryzen AI Probing
[                       ]  Phase 3: Multi-GPU Rooflines & Dynamic KV Paging
[                       ]  Phase 4: Global Community Intelligence Hub
```

---

## ✅ Phase 1: Core Physics Engine & Native Desktop App *(Released)*

- [x] **Analytical Memory Engine**: Closed-form VRAM calculation for Weights, KV Cache (FP16, Q8_0, Q4_0), and dynamic allocator headroom.
- [x] **Cross-Platform Desktop App**: Native Windows (.exe installer) and macOS (Apple Silicon & Intel) builds with Electron 44, React 19, and Vite.
- [x] **45+ Curated Open-Source Model Catalog**: DeepSeek R1/V3, Qwen 2.5/3, Llama 3.2/3.3, Gemma 2/3, Mistral, Phi-4, and StarCoder.
- [x] **In-App Hugging Face GGUF Downloader**: Stream verified GGUFs directly with resume support and real-time MB/s metrics.
- [x] **Dual Strategy Support**: Choose between fast ready-made GGUF streaming or local conversion command pipeline.
- [x] **One-Click Engine Bridge**: Import downloaded GGUFs into Ollama in seconds with automated Modelfile generation.
- [x] **Multi-Theme UI**: Cream, Studio White, Obsidian Dark, and AMD Radeon Red with first-launch theme chooser.
- [x] **Researcher Export Tools**: Instant export of benchmark runs to CSV and Markdown tables, plus JSON system diagnostics.

---

## 🚧 Phase 2: Native AMD ROCm & Ryzen AI Probing *(In Progress)*

- [ ] **ROCm 6.x Native Probing**: Direct detection of AMD CDNA (Instinct MI300X, MI250) and RDNA3 (Radeon RX 7900 XTX / 7800 XT / 7600) via `rocm-smi` and HIP runtime.
- [ ] **AMD Ryzen AI NPU Probing**: XDNA / NPU architecture detection and TOPs estimation for AI PCs.
- [ ] **AMD Lemonade Runtime Integration**: Native adapter for AMD's Lemonade local inference server alongside Ollama and LM Studio.
- [ ] **Automated Local Quantization Execution**: One-click local compilation and quantization pipeline using bundled `llama-quantize` binary without requiring manual terminal commands.
- [ ] **Linux Flatpak / AppImage Releases**: Official packaging for Ubuntu, Fedora, Arch, and SteamOS / ROG Ally.

---

## 🔮 Phase 3: Advanced Inference Architectures & Multi-GPU *(Upcoming)*

- [ ] **Multi-GPU Tensor Parallelism (TP) Calculator**: Predict VRAM and inter-connect bandwidth bottlenecks (PCIe 4.0/5.0 vs Infinity Fabric) across dual or quad AMD Radeon / Instinct setups.
- [ ] **FlashAttention & PagedAttention Simulation**: Precise VRAM overhead modeling for vLLM PagedAttention block tables and chunked prefill.
- [ ] **Speculative Decoding Speedup Estimator**: Calculate anticipated tok/s gains when running draft-target model pairs (e.g., Llama-3.2-1B draft + Llama-3.1-8B target).
- [ ] **Vision-Language Model (VLM) Modeling**: Add image token grid overhead calculations for Qwen2-VL, Llama-3.2-Vision, and Gemma-3 multimodal models.

---

## 🌐 Phase 4: Global Community Intelligence Hub *(Future)*

- [ ] **Decentralized Benchmark Leaderboard**: An open, opt-in registry where users can submit verified hardware benchmarks to improve empirical speed models for everyone.
- [ ] **Hardware Upgrade Recommendations**: "What should I buy?" feature that suggests optimal AMD GPU / RAM upgrades based on the models you want to run.
- [ ] **VS Code & Cursor Extension**: Quick inline memory fit calculator for AI developers working on LLM serving code.

---

## 💡 Proposing New Roadmap Items

Have an idea that isn't listed here? We'd love to hear it!
Open a [Feature Request](https://github.com/VedantJadhav701/AMD_LLM_LAB/issues/new?template=feature_request.md) or start a thread in [GitHub Discussions](https://github.com/VedantJadhav701/AMD_LLM_LAB/discussions).
