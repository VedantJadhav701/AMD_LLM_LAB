import { app, ipcMain, shell, type BrowserWindow } from "electron";
import path from "node:path";
import { CATALOG, findModel } from "../core/catalog";
import { evaluateAllQuants, recommend } from "../core/decide";
import type { EventMap, InvokeMap } from "../shared/ipc";
import { DEFAULT_SETTINGS, type BenchResult, type Calibration, type ChatMessage, type InstalledModel, type MachineProfile, type ModelSpec, type Settings } from "../shared/types";
import { runBenchmark } from "./bench";
import { detectMachine } from "./detect";
import { lookupHf } from "./hf";
import { buildHubPayload, submitToHub } from "./hub";
import { RuntimeRegistry } from "./runtime/discover";
import { assertLoopback } from "./runtime/types";
import { JsonStore } from "./store";

interface Persisted { settings: Settings; history: BenchResult[]; calibration: Calibration; fingerprint: string | null }
const fingerprint = (m: MachineProfile) => `${m.cpu.name}|${m.gpus.map((g) => g.name).join("+")}|${Math.round(m.ram.totalGiB)}`;
const EXTERNAL_OK = [/^https:\/\/ollama\.com(\/|$)/, /^https:\/\/lmstudio\.ai(\/|$)/, /^https:\/\/github\.com\/VedantJadhav701\/AMD_LLM_LAB(\/|$)/, /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/?$/, /^https:\/\/huggingface\.co\/models\?search=[\w%+.\-]{1,120}$/];
const MAX_MSG = 200_000;

export function registerIpc(getWindow: () => BrowserWindow | null, dataDir: string = app.getPath("userData")) {
  const store = new JsonStore<Persisted>(path.join(dataDir, "lab-data.json"), () => ({ settings: { ...DEFAULT_SETTINGS }, history: [], calibration: {}, fingerprint: null }));
  const registry = new RuntimeRegistry();
  const hfSpecs = new Map<string, ModelSpec>();
  let machine: MachineProfile | null = null;
  const chats = new Map<string, AbortController>();
  const pulls = new Map<string, AbortController>();
  let bench: { id: string; ctl: AbortController } | null = null;
  let machinePromise: Promise<MachineProfile> | null = null;

  const emit = <K extends keyof EventMap>(ch: K, payload: EventMap[K]) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send(ch, payload); };
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const handle = <K extends keyof InvokeMap>(ch: K, fn: (arg: InvokeMap[K][0]) => Promise<InvokeMap[K][1]> | InvokeMap[K][1]) => ipcMain.handle(ch, async (_e, arg) => fn(arg));

  async function settings(): Promise<Settings> { const s = (await store.read()).settings; return { ...DEFAULT_SETTINGS, ...s, overrides: { ...s.overrides } }; }
  async function getMachine(force = false): Promise<MachineProfile> {
    if (!machine || force) {
      machinePromise ??= detectMachine(true).finally(() => { machinePromise = null; });
      const m = await machinePromise;
      machine = m;
      const fp = fingerprint(m);
      const d = await store.read();
      // Measurements from different hardware must never be applied to this machine.
      if (d.fingerprint && d.fingerprint !== fp) await store.write({ ...d, calibration: {}, fingerprint: fp });
      else if (!d.fingerprint) await store.write({ ...d, fingerprint: fp });
    }
    return { ...machine, overrides: (await settings()).overrides };
  }
  const specFor = (id: string): ModelSpec => { const s = findModel(id) ?? hfSpecs.get(id); if (!s) throw new Error("Unknown model. Look it up again."); return s; };
  const kvBytes = (s: Settings) => (s.kvPrecision === "q8_0" ? 1.0625 : 2);
  const clampCtx = (n: unknown, fallback: number) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(1_048_576, Math.max(512, v)) : fallback; };
  const runtimeById = (id: string) => registry.get(String(id));
  const validMessages = (m: unknown): ChatMessage[] => {
    if (!Array.isArray(m) || m.length === 0 || m.length > 200) throw new Error("Invalid conversation.");
    let total = 0;
    return m.map((x) => {
      if (!x || !["system", "user", "assistant"].includes(x.role) || typeof x.content !== "string") throw new Error("Invalid message.");
      total += x.content.length; if (total > MAX_MSG) throw new Error("The conversation is too long for one request.");
      return { role: x.role, content: x.content };
    });
  };

  handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, userData: dataDir }));
  handle("app:openExternal", async (url) => { if (typeof url === "string" && EXTERNAL_OK.some((r) => r.test(url))) { await shell.openExternal(url); return true; } return false; });
  handle("machine:get", () => getMachine());
  handle("machine:refresh", () => getMachine(true));
  handle("settings:get", () => settings());
  handle("settings:set", async (patch) => {
    const cur = await settings();
    const next: Settings = { ...cur };
    const p = (patch ?? {}) as Partial<Settings>;
    if (p.overrides) {
      const o = p.overrides, clean: Settings["overrides"] = {};
      const pos = (x: unknown, max: number) => (typeof x === "number" && x > 0 && x <= max ? x : null);
      if (o.gpuIndex === null || Number.isInteger(o.gpuIndex)) clean.gpuIndex = o.gpuIndex;
      if (pos(o.vramGiB, 4096)) clean.vramGiB = o.vramGiB;
      if (pos(o.bandwidthGBps, 20000)) clean.bandwidthGBps = o.bandwidthGBps;
      if (pos(o.ramAvailableGiB, 8192)) clean.ramAvailableGiB = o.ramAvailableGiB;
      if (o.forceCpuOnly) clean.forceCpuOnly = true;
      next.overrides = clean;
    }
    if (p.defaultCtx !== undefined) next.defaultCtx = clampCtx(p.defaultCtx, cur.defaultCtx);
    if (typeof p.customRuntimeUrl === "string") { if (p.customRuntimeUrl.trim()) assertLoopback(p.customRuntimeUrl.trim()); next.customRuntimeUrl = p.customRuntimeUrl.trim(); }
    if (typeof p.hubUrl === "string") { if (p.hubUrl.trim()) { const u = new URL(p.hubUrl.trim()); if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("The hub address must use https."); } next.hubUrl = p.hubUrl.trim(); }
    if (p.kvPrecision === "f16" || p.kvPrecision === "q8_0") next.kvPrecision = p.kvPrecision;
    await store.update((d) => ({ ...d, settings: next }));
    return next;
  });
  handle("catalog:list", () => CATALOG);
  handle("hf:lookup", async (input) => { const d = await lookupHf(String(input)); hfSpecs.set(d.spec.id, d.spec); return { spec: d.spec, warnings: d.warnings }; });

  handle("decide:recommend", async (a) => {
    const [m, s, d] = [await getMachine(), await settings(), await store.read()];
    const goal = a?.goal === "speed" || a?.goal === "context" ? a.goal : "quality";
    return recommend(m, CATALOG, { goal, ctx: clampCtx(a?.ctx, s.defaultCtx), kvBytes: kvBytes(s), calibration: d.calibration, limit: 12 });
  });
  handle("decide:evaluate", async (a) => {
    const [m, s, d] = [await getMachine(), await settings(), await store.read()];
    const spec = specFor(String(a?.modelId));
    return { spec, verdicts: evaluateAllQuants(m, spec, { ctx: clampCtx(a?.ctx, s.defaultCtx), kvBytes: kvBytes(s), calibration: d.calibration }, a?.extended === true) };
  });

  handle("runtime:refresh", async () => registry.refresh((await settings()).customRuntimeUrl));
  handle("runtime:models", (id) => runtimeById(id).list());

  handle("chat:start", async (a) => {
    const rt = runtimeById(a?.runtimeId), messages = validMessages(a?.messages), model = String(a?.model ?? "");
    if (!model) throw new Error("Choose a model first.");
    const s = await settings(), id = uid(), ctl = new AbortController();
    chats.set(id, ctl);
    void rt.chat(model, messages, { ctx: clampCtx(a.ctx, s.defaultCtx) }, (text) => emit("chat:token", { id, text }), ctl.signal)
      .then((stats) => emit("chat:done", { id, stats }))
      .catch((e: Error) => emit(ctl.signal.aborted ? "chat:done" : "chat:error", ctl.signal.aborted ? { id, stats: { tokens: 0, decodeTokS: null, promptTokens: null, prefillTokS: null, ttftS: null, loadS: null, totalS: 0 } } : { id, message: friendly(e) } as never))
      .finally(() => chats.delete(id));
    return id;
  });
  handle("chat:stop", (id) => { chats.get(String(id))?.abort(); });

  handle("bench:start", async (a) => {
    if (bench) throw new Error("A benchmark is already running.");
    const rt = runtimeById(a?.runtimeId), model = a?.model as InstalledModel;
    if (!model?.name) throw new Error("Choose a model first.");
    const [m, s] = [await getMachine(), await settings()];
    const ctx = clampCtx(a.ctx, s.defaultCtx), id = uid(), ctl = new AbortController();
    bench = { id, ctl };
    const spec = model.catalogId ? findModel(model.catalogId) : undefined;
    const predicted = spec && model.quant ? evaluateAllQuants(m, spec, { ctx, kvBytes: kvBytes(s) }).find((v) => v.quant === (model.quant as string))?.plan?.speed ?? null : null;
    void runBenchmark(rt, model, m, { ctx, predicted }, (step, frac) => emit("bench:progress", { id, step, frac }), ctl.signal)
      .then(async ({ result, calibration }) => {
        const d = await store.update((x) => ({ ...x, history: [result, ...x.history].slice(0, 500), calibration: { ...x.calibration, ...calibration } }));
        emit("bench:done", { id, result, calibration: d.calibration });
      })
      .catch((e: Error) => emit("bench:done", ctl.signal.aborted ? { id, cancelled: true } : { id, error: friendly(e) }))
      .finally(() => { void rt.unload?.(model.name); bench = null; });
    return id;
  });
  handle("bench:cancel", () => { bench?.ctl.abort(); });

  handle("pull:start", (a) => {
    const rt = runtimeById(a?.runtimeId), name = String(a?.model ?? "").trim();
    if (!rt.pull) throw new Error("This runtime cannot download models from here. Use its own app.");
    if (!/^[\w.\-:/]{1,120}$/.test(name)) throw new Error("That does not look like a valid model name.");
    const id = uid(), ctl = new AbortController(); pulls.set(id, ctl);
    void rt.pull(name, (p) => emit("pull:progress", { id, ...p }), ctl.signal).then(() => emit("pull:done", { id }))
      .catch((e: Error) => emit("pull:done", { id, error: ctl.signal.aborted ? "Cancelled" : friendly(e) })).finally(() => pulls.delete(id));
    return id;
  });
  handle("pull:cancel", (id) => { pulls.get(String(id))?.abort(); });

  handle("history:list", async () => (await store.read()).history);
  handle("history:delete", async (id) => (await store.update((d) => ({ ...d, history: d.history.filter((h) => h.id !== id) }))).history);
  handle("history:clear", async () => { await store.update((d) => ({ ...d, history: [] })); });
  handle("calibration:get", async () => (await store.read()).calibration);
  handle("calibration:clear", async () => { await store.update((d) => ({ ...d, calibration: {} })); });

  handle("hub:preview", async (id) => {
    const h = (await store.read()).history.find((x) => x.id === id);
    if (!h) return { error: "Run not found." };
    const r = buildHubPayload(h, await getMachine(), app.getVersion());
    return "error" in r ? r : { payload: r.payload, hubUrl: (await settings()).hubUrl };
  });
  handle("hub:submit", async (id) => {
    const [d, s] = [await store.read(), await settings()];
    const h = d.history.find((x) => x.id === id);
    if (!h) throw new Error("Run not found.");
    if (!s.hubUrl) throw new Error("Set the hub address in Settings first.");
    const r = buildHubPayload(h, await getMachine(), app.getVersion());
    if ("error" in r) throw new Error(r.error);
    const out = await submitToHub(s.hubUrl, r.payload);
    await store.update((x) => ({ ...x, history: x.history.map((y) => (y.id === id ? { ...y, shared: true } : y)) }));
    return out;
  });

  return { dispose: () => { chats.forEach((c) => c.abort()); pulls.forEach((c) => c.abort()); bench?.ctl.abort(); }, getMachine };
}

function friendly(e: Error): string {
  const m = e.message || String(e);
  if (/ECONNREFUSED|fetch failed|Failed to fetch/i.test(m)) return "Could not reach the model server. Is it still running?";
  if (/not found|pull/i.test(m) && /model/i.test(m)) return `${m} Download it first.`;
  if (/memory|alloc|OOM/i.test(m)) return `${m} The model may be too large for the memory available. Try a smaller quantization or context.`;
  return m;
}
