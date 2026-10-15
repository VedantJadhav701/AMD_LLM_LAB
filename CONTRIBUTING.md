# 🤝 Contributing to AMD LLM Lab

First off, thank you for considering contributing to **AMD LLM Lab**! 🎉 

AMD LLM Lab is an open-source project dedicated to making LLM inference transparent, predictable, and optimized across AMD hardware (Instinct™ MI300X/MI250, Radeon™ RX 7000/6000 series, Ryzen™ APUs with Radeon graphics, and Ryzen AI NPUs) as well as cross-platform architectures.

Whether you're fixing a bug, adding a new model to the catalog, sharing real-world hardware benchmarks, improving the UI, or writing documentation, every contribution helps the community run local AI faster and smarter.

> 🌟 **Found this project helpful?** Give it a **[Star on GitHub](https://github.com/VedantJadhav701/AMD_LLM_LAB)** to help others discover it!

---

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can You Contribute?](#-how-can-you-contribute)
  - [1. Add New Models to the Catalog](#1-add-new-models-to-the-catalog)
  - [2. Submit Hardware Benchmarks](#2-submit-hardware-benchmarks)
  - [3. Code & Feature Development](#3-code--feature-development)
  - [4. Report Bugs & Suggest Enhancements](#4-report-bugs--suggest-enhancements)
- [Development Setup](#-development-setup)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [Repository Structure](#-repository-structure)
- [Pull Request Workflow](#-pull-request-workflow)
- [Coding Standards & Conventions](#-coding-standards--conventions)
- [Testing Guidelines](#-testing-guidelines)
- [Community & Support](#-community--support)

---

## 📜 Code of Conduct

This project adheres to the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating in AMD LLM Lab, you agree to uphold a welcoming, respectful, and inclusive environment for everyone.

---

## 🎯 How Can You Contribute?

### 1. Add New Models to the Catalog
New open-source models drop every week! If a new model from DeepSeek, Qwen, Meta, Mistral, Google, or the community releases, you can add it in seconds:

1. Open `amd-llm-lab-desktop/desktop/src/core/catalog.ts`.
2. Add a new `ModelSpec` entry:
   ```typescript
   {
     id: "my-new-model-8b",
     name: "My New Model 8B",
     family: "MyOrg",
     paramsB: 8.0,
     activeParamsB: 8.0, // or lower for MoE architectures
     contextDefault: 4096,
     maxContext: 131072,
     hf: "org/my-new-model-8b-instruct",
     approx: false,
   }
   ```
3. Run `npm test` to verify catalog validation passes.
4. Submit a PR!

### 2. Submit Hardware Benchmarks
Help us calibrate speed predictions for everyone! Run a benchmark in the desktop app's **Lab** tab, then:
- Use **Copy Markdown** in the **Benchmark History** tab and paste it into a GitHub Discussion or a [Benchmark Issue](https://github.com/VedantJadhav701/AMD_LLM_LAB/issues/new?template=hardware_benchmark.md).
- Or click **Export JSON** on the **My Machine** page to share your GPU/CPU hardware profile.

### 3. Code & Feature Development
Look for open issues labeled:
- [`good first issue`](https://github.com/VedantJadhav701/AMD_LLM_LAB/labels/good%20first%20issue): Great for beginners to the codebase.
- [`help wanted`](https://github.com/VedantJadhav701/AMD_LLM_LAB/labels/help%20wanted): High-priority community features.
- [`enhancement`](https://github.com/VedantJadhav701/AMD_LLM_LAB/labels/enhancement): New features and improvements.

### 4. Report Bugs & Suggest Enhancements
Found a bug or have a great idea?
- Check existing [GitHub Issues](https://github.com/VedantJadhav701/AMD_LLM_LAB/issues) first to prevent duplicates.
- Use our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) or [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).

---

## 💻 Development Setup

### Prerequisites
- **Node.js**: `v20.0.0` or later (LTS recommended)
- **npm**: `v10.0.0` or later
- **Git**: Installed and configured
- **Platform**: Windows, macOS, or Linux

### Quick Start

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/AMD_LLM_LAB.git
   cd AMD_LLM_LAB/amd-llm-lab-desktop/desktop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode (with Vite Hot Module Replacement):**
   ```bash
   npm run dev
   ```
   This compiles the Electron main process and launches the renderer with live reload.

4. **Run the test suite:**
   ```bash
   npm test
   ```

5. **Run TypeScript typecheck:**
   ```bash
   npm run typecheck
   ```

6. **Build production bundles:**
   ```bash
   npm run build
   ```

---

## 🏛️ Repository Structure

```
AMD_LLM_LAB/
├── amd-llm-lab-desktop/
│   └── desktop/
│       ├── src/
│       │   ├── core/           # Pure TypeScript inference engine (no Electron/Node dependencies)
│       │   │   ├── catalog.ts  # Curated models (DeepSeek, Llama, Qwen, Gemma, etc.)
│       │   │   ├── decide.ts   # VRAM fit calculator & recommendation engine
│       │   │   ├── memory.ts   # Analytic KV cache & weights formula
│       │   │   ├── quants.ts   # Quantization definitions (FP16 down to IQ1_S)
│       │   │   └── speed.ts    # Roofline bandwidth & token speed prediction
│       │   ├── main/           # Electron main process (secure Node backend)
│       │   │   ├── detect.ts   # Native hardware inspection (GPU, VRAM, CPU, RAM)
│       │   │   ├── hf.ts       # Hugging Face downloader with integrity check
│       │   │   ├── ipc.ts      # Strictly typed IPC handlers
│       │   │   └── runtime/    # Adapters for Ollama, LM Studio, llama.cpp
│       │   ├── preload/        # Secure Electron contextBridge isolation
│       │   ├── renderer/       # React 19 + TypeScript desktop UI
│       │   │   ├── pages/      # CanRun, FitStudio, Lab, Machine, History, Settings
│       │   │   └── components/ # Reusable UI components, themes, and visualizations
│       │   └── shared/         # Shared TypeScript interfaces (IPC, types, specs)
│       └── tests/              # Vitest test suite (64+ tests)
├── dashboard/                  # Web dashboard (Next.js 16)
└── backend/                    # FastAPI analytical reference backend
```

---

## 🔀 Pull Request Workflow

1. **Create a descriptive branch:**
   ```bash
   git checkout -b feat/add-deepseek-v3-support
   # or
   git checkout -b fix/vram-allocator-headroom
   ```

2. **Make your changes:**
   - Keep commits focused and atomic.
   - Use clear commit messages following Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

3. **Verify tests and types pass locally:**
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```
   > ⚠️ All PRs must pass `npm test` and `npm run typecheck` before merging.

4. **Push to your fork and submit a PR:**
   - Fill out the provided [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
   - Link any related issue (e.g., `Closes #42`).

---

## 📐 Coding Standards & Conventions

- **Strict Type Safety**: Avoid `any` whenever possible. Leverage existing types from `src/shared/types.ts`.
- **Pure Core Isolation**: Never import `electron`, `fs`, or Node-only APIs inside `src/core/`. The core must remain 100% portable.
- **Secure IPC**: All IPC channels must be declared in `src/shared/ipc.ts` with strict input validation and loopback isolation.
- **Multi-Theme Support**: Respect CSS variables (`var(--bg)`, `var(--card)`, `var(--accent)`, `var(--text)`) so all additions adapt to Cream, Studio White, Obsidian, and Radeon themes.

---

## 🧪 Testing Guidelines

We use [Vitest](https://vitest.dev/) for fast, isolated unit and integration testing.
- Write tests in `tests/` for any new core logic, hardware detection parsers, or memory math.
- Mock external network calls and model servers (see `tests/runtime.test.ts` for reference mock patterns).

---

## 🌟 Contributor Recognition

Contributors will be recognized in:
- The GitHub release notes for each version release.
- The project's README contributor hall of fame.

Thank you for helping make AMD LLM Lab the most helpful open-source tool for local AI inference! 🚀
