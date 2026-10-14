# Prompt for your coding agent

You are working on `desktop/`, the Electron app for AMD LLM Lab (Electron 44, React 19, Vite, TypeScript, vitest). Read README.md first, then src/core/decide.ts (pure decision engine), src/main/ (detect, runtime, bench, ipc, hub) and src/renderer/.

Rules: keep core/ pure and tested; keep contextIsolation, sandbox, the CSP in main/index.ts and the IPC allowlist in shared/ipc.ts; runtime URLs stay loopback-only; never send data without a user-reviewed preview; be honest in the UI about estimates vs measurements. Run `npm test`, `npm run typecheck` and `npm run e2e` before finishing any change.

Do these in order, one at a time, committing after each:
1. Install deps and run everything on a real Windows laptop and a real Mac. Fix any detection bug (src/main/detect/*). Add a fixture and test for each real machine's raw output, including AMD Ryzen AI and Strix Halo, NVIDIA laptops, Apple M1-M4.
2. Replace the JS memory probe (src/main/memprobe.ts) with a more accurate one if possible, and recheck the efficiency priors in src/core/hwdb.ts against real benchmarks; update tests/decide.test.ts expectations with measured data.
3. Run `npm run dist:win` and `npm run dist:mac`, test the installers, set up code signing and notarization, and add electron-updater auto-update.
4. Add in-app model download for LM Studio and llama.cpp (GGUF from Hugging Face), with disk-space check and progress.
5. Add AMD-specific paths: detect ROCm/Vulkan/Lemonade, NPU models, and a clear per-runtime "is my GPU being used" check.
6. Polish: Playwright screenshot tests, keyboard accessibility, light theme, empty/error states.
Report what you verified on real hardware and what you could not.
