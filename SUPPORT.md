# 💬 Getting Support for AMD LLM Lab

Thank you for using AMD LLM Lab! We're here to help you get the best local LLM inference performance out of your hardware.

---

## 🔍 Frequently Asked Questions

### 1. "Why does a model show as 'Fits Slowly'?"
When a model's weight + KV cache footprint exceeds your dedicated GPU VRAM (e.g. 8GB), AMD LLM Lab splits the layers between GPU VRAM and System RAM. Running layers across the PCIe bus operates at memory bandwidth speeds (~30–80 GB/s) rather than GPU VRAM bandwidth (~250–1000+ GB/s), leading to a throughput drop.

### 2. "How do I connect Ollama, LM Studio, or llama.cpp?"
The desktop application automatically detects local model servers running on their standard ports:
- **Ollama**: `http://127.0.0.1:11434`
- **LM Studio / OpenAI-compatible / llama.cpp**: `http://127.0.0.1:1234` or `http://127.0.0.1:8080`
Simply launch your preferred model server, and it will immediately appear in the **Lab** tab.

### 3. "My GPU bandwidth says 'Estimated' – can I calibrate it?"
Yes! In the **Lab** tab, select an installed model and click **Run Benchmark**. AMD LLM Lab will measure your real-world tok/s and calculate your exact effective memory bandwidth, making all future model predictions 100% tailored to your specific silicon.

---

## 📬 Channels for Support

| Channel | Best For | Link |
| :--- | :--- | :--- |
| **GitHub Discussions** | Questions, setup help, sharing benchmarks & ideas | [Start a Discussion](https://github.com/VedantJadhav701/AMD_LLM_LAB/discussions) |
| **GitHub Issues** | Reproducible bugs, crashes, or model calculation errors | [Open an Issue](https://github.com/VedantJadhav701/AMD_LLM_LAB/issues) |
| **Feature Requests** | Suggesting new models, runtimes, or calculators | [Request a Feature](https://github.com/VedantJadhav701/AMD_LLM_LAB/issues/new?template=feature_request.md) |
| **Hashnode Article** | In-depth engineering breakdown & comments | [Read the Deep Dive](https://vedantjadhav.hashnode.dev/amd-llm-lab) |

---

## 🌟 Show Your Support

If AMD LLM Lab helped you understand your hardware or pick the right model:
- ⭐ **[Star the repository on GitHub](https://github.com/VedantJadhav701/AMD_LLM_LAB)**
- 🐦 Share your benchmark on X/Twitter or LinkedIn and tag us!
- 🤝 Consider contributing a model or benchmark to the project!
