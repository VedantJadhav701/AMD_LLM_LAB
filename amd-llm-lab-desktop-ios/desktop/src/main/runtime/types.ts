import type { ChatMessage, GenStats, InstalledModel, Placement, RuntimeStatus } from "../../shared/types";

export interface GenOptions { ctx: number; maxTokens?: number; temperature?: number; keepAlive?: string }
export interface Runtime {
  id: string;
  name: string;
  kind: "ollama" | "openai";
  baseUrl: string;
  status(): Promise<RuntimeStatus>;
  list(): Promise<InstalledModel[]>;
  chat(model: string, messages: ChatMessage[], opts: GenOptions, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenStats>;
  /** How much of the loaded model sits on the GPU. Only Ollama reports this. */
  placement(model: string): Promise<Placement | null>;
  pull?(model: string, onProgress: (p: { status: string; completed?: number; total?: number }) => void, signal?: AbortSignal): Promise<void>;
  unload?(model: string): Promise<void>;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Only talk to this computer. Prevents the renderer or a setting from pointing the app at the internet. */
export function assertLoopback(url: string): URL {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`Not a valid URL: ${url}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs are allowed.");
  if (!LOOPBACK.has(u.hostname)) throw new Error("Runtime URLs must point to this computer (localhost).");
  return u;
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 4000);
  try {
    const res = await fetch(url, { ...init, signal: init.signal ?? ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
    return (await res.json()) as T;
  } finally { clearTimeout(t); }
}

/** Reads a streaming body line by line (NDJSON or SSE). */
export async function* lines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); if (l) yield l; }
  }
  if (buf.trim()) yield buf.trim();
}
export const GiB = 1024 ** 3;
