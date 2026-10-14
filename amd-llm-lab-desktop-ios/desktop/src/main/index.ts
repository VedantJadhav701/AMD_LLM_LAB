import { app, BrowserWindow, Menu, nativeTheme, session, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc";

const isDev = !!process.env.LAB_DEV_URL;
const CSP = [
  "default-src 'none'",
  `script-src 'self'${isDev ? " 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "base-uri 'none'", "form-action 'none'", "object-src 'none'",
].join("; ");

let win: BrowserWindow | null = null;
let ipc: ReturnType<typeof registerIpc> | null = null;

if (process.env.LAB_USER_DATA) app.setPath("userData", process.env.LAB_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const theme = () => (nativeTheme.shouldUseDarkColors ? { bg: "#000000", fg: "#f5f5f7" } : { bg: "#f2f2f7", fg: "#1c1c1e" });

function createWindow() {
  const mac = process.platform === "darwin";
  const t = theme();
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640, show: false, backgroundColor: t.bg, title: "AMD LLM Lab",
    ...(mac ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 18, y: 18 } } : { titleBarStyle: "hidden" as const, titleBarOverlay: { color: t.bg, symbolColor: t.fg, height: 44 } }),
    webPreferences: { preload: path.join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  nativeTheme.on("updated", () => { const n = theme(); win?.setBackgroundColor(n.bg); if (process.platform !== "darwin") win?.setTitleBarOverlay({ color: n.bg, symbolColor: n.fg, height: 44 }); });
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => { win = null; });
  // The window may only ever show our own UI. Anything else opens in the system browser, and only if allowlisted.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/(github\.com|ollama\.com|lmstudio\.ai|huggingface\.co)\//.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { const ok = isDev ? url.startsWith(process.env.LAB_DEV_URL!) : url.startsWith("file://"); if (!ok) e.preventDefault(); });
  if (isDev) void win.loadURL(process.env.LAB_DEV_URL!);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, "Content-Security-Policy": [CSP] } }));
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]) : null);
  ipc = registerIpc(() => win);
  createWindow();
  // Warm hardware detection in the background so the first screen is instant.
  void ipc.getMachine().catch(() => undefined);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { ipc?.dispose(); if (process.platform !== "darwin") app.quit(); });
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
