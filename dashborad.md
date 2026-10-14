🖥️ AMD LLM Lab — Frontend & Cross-Platform Electron Desktop GuideThis document outlines the architectural upgrades, bug fixes, and drop-in code required to transform your Next.js 16 web dashboard into a fully native cross-platform Electron desktop application for Windows and macOS, complete with an auto-managed Python FastAPI sidecar process and local hardware probing.🛠️ Part 1: Frontend & UI Bug Fixes1. Fix Stacked Progress Bar Math in fit_page.tsxThe Bug: In fit_page.tsx, the outer container sets style={{ width: pct(result.total_gb) }}, causing child bars to calculate their width relative to vram instead of result.total_gb.The Fix: Remove width restriction from the parent wrapper so weights, KV cache, and overhead stack proportionally:TypeScript{/* Replace lines 149-155 in dashboard/app/fit/page.tsx */}
<div className="relative h-9 border border-[var(--line)] bg-[var(--surface-2)]" role="img" aria-label="Memory breakdown">
  <div className="flex h-full w-full">
    <div style={{ width: pct(result.weights_gb), background: "var(--cyan)" }} title="Weights" />
    <div style={{ width: pct(result.kv_cache_gb), background: "#7be3f3" }} title="KV cache" />
    <div style={{ width: pct(result.overhead_gb), background: "#4b5057" }} title="Overhead" />
  </div>
  <div className="absolute inset-y-0 border-r-2 border-white" style={{ left: pct(vram) }} title={`GPU memory: ${vram} GB`} />
</div>
2. Fix "Enter the Lab" Links Pointing to GitHub (landing_page.tsx)The Bug: Landing page CTAs pointed to href={repo} ([https://github.com/](https://github.com/)...) instead of internal views.The Fix: Route users directly to /lab:TypeScript{/* In dashboard/app/landing_page.tsx, replace external hrefs for internal entry */}
<Link href="/lab" className="btn btn--solid">
  Enter the lab <ArrowUpRight size={17} />
</Link>
3. Fix CLI Benchmark Path in hub_page.tsxThe Bug: Instructed users to run python bench/rocm_bench.py, whereas the script lives in backend/rocm_bench.py.   The Fix: Update COMMANDS in hub_page.tsx:TypeScriptconst COMMANDS = `pip install torch transformers   # use ROCm build of PyTorch on AMD
python backend/rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --contexts 512,2048
# review amd_llm_lab_results.json, then share:
python backend/rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --contexts 512,2048 --submit --api <hub-url>`;
⚡ Part 2: Cross-Platform Electron Architecture (Windows & macOS)To package AMD LLM Lab as a standalone desktop app for Windows and macOS, we need:Electron Main Process (electron/main.ts): Manages the desktop window and spawns the Python FastAPI backend as a bundled sidecar.Preload Script (electron/preload.ts): Safely exposes bridge APIs.Electron Builder Configuration (electron-builder.yml): Packages Node, Next.js static export / server, and Python environment into native .dmg (macOS) and .exe / .nsis (Windows) installers.1. Electron Main Process (electron/main.ts)TypeScript// electron/main.ts
import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import * as detectPort from "detect-port";

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
const FASTAPI_PORT = 8000;

async function startPythonBackend() {
  const freePort = await detectPort(FASTAPI_PORT);
  const isDev = !app.isPackaged;

  const pythonScript = isDev
    ? path.join(__dirname, "../../backend/api/main.py")
    : path.join(process.resourcesPath, "backend", "api", "main.py");

  const pythonExecutable = process.platform === "win32" ? "python" : "python3";

  console.log(`Starting FastAPI sidecar on port ${freePort}...`);
  pythonProcess = spawn(pythonExecutable, ["-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", String(freePort)], {
    cwd: isDev ? path.join(__dirname, "../../backend") : path.join(process.resourcesPath, "backend"),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  pythonProcess.stdout?.on("data", (data) => console.log(`[FastAPI]: ${data}`));
  pythonProcess.stderr?.on("data", (data) => console.error(`[FastAPI Error]: ${data}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "AMD LLM Lab",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startPythonBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
2. Electron Preload Script (electron/preload.ts)TypeScript// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getApiPort: () => 8000,
});
3. Native Cross-Platform Hardware Probe Enhancement (backend/api/main.py)To ensure macOS (Apple Silicon unified memory via Metal/sysctl) and Windows (WMI / PowerShell) report accurate hardware specs in /hardware/local, add OS-specific probes:Python# Add to local_hardware() in backend/api/main.py:
    if system == "Darwin":
        try:
            # Apple Silicon Unified Memory & Chip Probe
            mem_probe = subprocess.run(["sysctl", "hw.memsize"], capture_output=True, text=True, timeout=2)
            mem_bytes = int(mem_probe.stdout.strip().split()[-1])
            total_gb = round(mem_bytes / (1024 ** 3), 2)
            
            gpu_probe = subprocess.run(["system_profiler", "SPDisplaysDataType"], capture_output=True, text=True, timeout=3)
            chip_match = re.search(r"Chipset Model:\s*(Apple M\d+\s*(?:Pro|Max|Ultra)?)", gpu_probe.stdout)
            gpu_name = chip_match.group(1) if chip_match else "Apple Silicon GPU"
            
            gpu = {
                "available": True,
                "name": gpu_name,
                "vram_gb": total_gb,  # Unified memory usable as VRAM
                "vram_free_gb": round(total_gb * 0.75, 2),
                "vendor": "Apple",
                "detection_method": "system_profiler",
            }
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
4. Electron Builder Configuration (electron-builder.yml)YAML# electron-builder.yml
appId: com.vedantjadhav.amdllmlab
productName: AMD LLM Lab
directories:
  output: dist
  buildResources: build
files:
  - "dist-electron/**/*"
  - "dashboard/out/**/*"
  - "backend/**/*"
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
win:
  target:
    - nsis
extraResources:
  - from: backend/
    to: backend
    filter:
      - "**/*"
      - "!__pycache__"
      - "!.venv"
📦 Package.json Build Scripts for Desktop AppAdd these scripts to your package.json to compile and package for both Windows and macOS:JSON"scripts": {
  "dev": "node scripts/generate-public-data.mjs && next dev -H 127.0.0.1 -p 3000",
  "build:next": "node scripts/generate-public-data.mjs && next build",
  "build:electron": "tsc -p electron/tsconfig.json",
  "package:mac": "npm run build:next && npm run build:electron && electron-builder --mac",
  "package:win": "npm run build:next && npm run build:electron && electron-builder --win"
}