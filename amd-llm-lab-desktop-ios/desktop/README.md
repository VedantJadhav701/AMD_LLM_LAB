# AMD LLM Lab (desktop)

Electron app for Windows and macOS. It reads your laptop, tells you which local LLMs will run well (memory fit plus a tokens/s range), then lets you chat with and benchmark them through Ollama, LM Studio, llama.cpp server or AMD Lemonade. A benchmark replaces the estimates with your own measured numbers. No telemetry; sharing to the hub is opt-in with a payload preview.

Independent open-source project, not an official AMD product. Drop this folder into the repo as `desktop/` (the workflow expects that).

## Design
iOS-style UI (system font, large titles, grouped rounded cards, segmented controls, sheets), light and dark following the OS, for both Windows and macOS. Not tested on real Windows or macOS displays: only a Linux render. Windows overlay buttons and the macOS traffic lights are set from the OS theme.

## Fit Studio
Choose any quantization level from Q8_0 down to IQ1_S (about 2 bits in practice). The engine shows memory fit, speed range and an honest quality tier. One-click download, conversion and running of the result inside the app is NOT built yet; see FIT_STUDIO_PLAN.md. Today the button opens a Hugging Face GGUF search.

## Run
```
npm install
npm run dev        # development
npm test           # 63 unit tests
npm run e2e        # real Electron + mock Ollama (Linux: xvfb-run -a npm run e2e)
npm run dist:win   # on Windows
npm run dist:mac   # on macOS
```
Tag `v*` to build both installers in GitHub Actions (`.github/workflows/desktop.yml`).

## Verified vs not
Verified in a Linux sandbox: unit tests (engine, hardware parsers with fixtures, HF config derivation, hub payload, runtime adapters), typecheck, production build, and the real Electron app driven end to end against a mock Ollama (overview, can-I-run, benchmark, chat streaming, history).

NOT verified (no access): hardware detection on real Windows/macOS machines (PowerShell/system_profiler parsers are tested on sample data only), real GPU runs, installers and code signing (unsigned builds trigger SmartScreen/Gatekeeper warnings), real Ollama and Hugging Face networks.

Accuracy notes: GPU bandwidth is a published-spec table. Efficiency curves were fitted to llama.cpp results recalled from memory, not re-verified, so treat uncalibrated speeds as a range. The memory-bandwidth probe is a simple JS loop and likely under-reads; it is a conservative floor. Predictions tighten after you run a benchmark.

Not built yet: NPU speed prediction, auto-update, in-app downloads for runtimes other than Ollama.
