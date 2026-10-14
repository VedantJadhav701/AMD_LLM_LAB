// Starts Vite, rebuilds the main process, and launches Electron pointed at the dev server.
import { spawn } from "node:child_process";
import { createServer } from "vite";
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
await new Promise((r, j) => spawn("node", ["scripts/build-main.mjs"], { stdio: "inherit" }).on("exit", (c) => (c === 0 ? r() : j(new Error("main build failed")))));
const electron = (await import("electron")).default;
const p = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, LAB_DEV_URL: "http://localhost:5173/" } });
p.on("exit", async () => { await server.close(); process.exit(0); });
