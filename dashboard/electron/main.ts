import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";

const API_PORT = Number(process.env.AMD_LLM_LAB_API_PORT ?? 8000);
const UI_PORT = Number(process.env.AMD_LLM_LAB_UI_PORT ?? 3000);
const development = !app.isPackaged || process.argv.includes("--dev");
let apiProcess: ChildProcess | undefined;
let uiProcess: ChildProcess | undefined;

function requestOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(750, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await requestOk(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start within 30 seconds.`);
}

function backendDirectory(): string {
  return development
    ? path.resolve(app.getAppPath(), "..", "backend")
    : path.join(process.resourcesPath, "backend");
}

async function startBackend(): Promise<void> {
  const healthUrl = `http://127.0.0.1:${API_PORT}/health`;
  if (await requestOk(healthUrl)) return;

  const python = process.env.AMD_LLM_LAB_PYTHON
    ?? (process.platform === "win32" ? "python.exe" : "python3");
  apiProcess = spawn(python, ["-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)], {
    cwd: backendDirectory(),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: development ? "inherit" : "ignore",
    windowsHide: true,
  });
  await waitFor(healthUrl, "AMD LLM Lab API");
}

async function startUi(): Promise<void> {
  if (development) return;
  const healthUrl = `http://127.0.0.1:${UI_PORT}`;
  if (await requestOk(healthUrl)) return;

  const nextCli = path.join(app.getAppPath(), "node_modules", "next", "dist", "bin", "next");
  uiProcess = spawn(process.execPath, [nextCli, "start", "-H", "127.0.0.1", "-p", String(UI_PORT)], {
    cwd: app.getAppPath(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitFor(healthUrl, "AMD LLM Lab UI");
}

async function createWindow(): Promise<void> {
  await startBackend();
  await startUi();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    title: "AMD LLM Lab",
    backgroundColor: "#0d0f12",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  const appUrl = (process.env.AMD_LLM_LAB_DESKTOP_URL ?? `http://127.0.0.1:${UI_PORT}`) + "/lab";
  await window.loadURL(appUrl);
}

function stop(process?: ChildProcess): void {
  if (process && !process.killed) process.kill();
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  stop(apiProcess);
  stop(uiProcess);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stop(apiProcess);
  stop(uiProcess);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
