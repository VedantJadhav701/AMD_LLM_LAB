import type { ChatMessage, GenStats, InstalledModel, Placement, RuntimeStatus } from "../../shared/types";
import { matchInstalledName } from "../../core/catalog";
import { assertLoopback, fetchJson, GiB, lines, type GenOptions, type Runtime } from "./types";

interface Tags { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string; family?: string } }> }
interface Ps { models?: Array<{ name: string; size?: number; size_vram?: number }> }

export function parseParams(s?: string): number | null {
  const m = /([\d.]+)\s*([BMK])/i.exec(s ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toUpperCase() === "B" ? n : m[2].toUpperCase() === "M" ? n / 1000 : n / 1e6;
}

export class OllamaRuntime implements Runtime {
  readonly kind = "ollama" as const;
  readonly name = "Ollama";
  readonly id: string;
  readonly baseUrl: string;
  constructor(baseUrl = "http://127.0.0.1:11434") { this.baseUrl = assertLoopback(baseUrl).origin; this.id = `ollama@${this.baseUrl}`; }

  async status(): Promise<RuntimeStatus> {
    try {
      const v = await fetchJson<{ version?: string }>(`${this.baseUrl}/api/version`, { timeoutMs: 1500 });
      return { id: this.id, name: this.name, kind: this.kind, baseUrl: this.baseUrl, online: true, version: v.version ?? null };
    } catch (e) { return { id: this.id, name: this.name, kind: this.kind, baseUrl: this.baseUrl, online: false, error: (e as Error).message }; }
  }

  async list(): Promise<InstalledModel[]> {
    const t = await fetchJson<Tags>(`${this.baseUrl}/api/tags`);
    return (t.models ?? []).map((m) => ({
      runtimeId: this.id, name: m.name, sizeGiB: m.size ? m.size / GiB : null, paramsB: parseParams(m.details?.parameter_size),
      quant: m.details?.quantization_level ?? null, family: m.details?.family ?? null, catalogId: matchInstalledName(m.name)?.id ?? null,
    }));
  }

  async placement(model: string): Promise<Placement | null> {
    try {
      const ps = await fetchJson<Ps>(`${this.baseUrl}/api/ps`);
      const m = (ps.models ?? []).find((x) => x.name === model || x.name.startsWith(model + ":") || model.startsWith(x.name));
      if (!m || !m.size) return null;
      return { gpuFraction: Math.min(1, (m.size_vram ?? 0) / m.size), sizeGiB: m.size / GiB, vramGiB: (m.size_vram ?? 0) / GiB };
    } catch { return null; }
  }

  async chat(model: string, messages: ChatMessage[], opts: GenOptions, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenStats> {
    const t0 = performance.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ model, messages, stream: true, keep_alive: opts.keepAlive ?? "10m", options: { num_ctx: opts.ctx, num_predict: opts.maxTokens ?? -1, temperature: opts.temperature ?? 0.7 } }),
    });
    if (!res.ok) throw new Error(await errText(res));
    let tokens = 0, ttft: number | null = null;
    let final: Record<string, number> | null = null;
    for await (const l of lines(res)) {
      let j: { message?: { content?: string }; done?: boolean; error?: string } & Record<string, number>;
      try { j = JSON.parse(l); } catch { continue; }
      if (j.error) throw new Error(String(j.error));
      const c = j.message?.content;
      if (c) { if (ttft === null) ttft = (performance.now() - t0) / 1000; tokens++; onToken(c); }
      if (j.done) final = j;
    }
    const ns = (k: string) => (final && final[k] ? final[k] / 1e9 : null);
    const evalCount = final?.eval_count ?? tokens;
    const evalS = ns("eval_duration"), pS = ns("prompt_eval_duration");
    return {
      tokens: evalCount, decodeTokS: evalS && evalS > 0 ? evalCount / evalS : null,
      promptTokens: final?.prompt_eval_count ?? null, prefillTokS: pS && pS > 0 && final?.prompt_eval_count ? final.prompt_eval_count / pS : null,
      ttftS: ttft, loadS: ns("load_duration"), totalS: (performance.now() - t0) / 1000,
    };
  }

  async pull(model: string, onProgress: (p: { status: string; completed?: number; total?: number }) => void, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true }), signal });
    if (!res.ok) throw new Error(await errText(res));
    for await (const l of lines(res)) {
      try { const j = JSON.parse(l); if (j.error) throw new Error(j.error); onProgress({ status: j.status, completed: j.completed, total: j.total }); }
      catch (e) { if ((e as Error).message && !(e instanceof SyntaxError)) throw e; }
    }
  }

  async unload(model: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => undefined);
  }

  async createFromGguf(name: string, ggufPath: string): Promise<void> {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const cleanPath = ggufPath.replace(/\\/g, "/");
    const tempModelfile = path.join(os.tmpdir(), `Modelfile-${Date.now()}`);
    await fs.writeFile(tempModelfile, `FROM ${cleanPath}\n`, "utf8");

    try {
      await execFileAsync("ollama", ["create", name, "-f", tempModelfile]);
    } catch {
      // Fallback to HTTP endpoint with all variant fields
      const res = await fetch(`${this.baseUrl}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: name,
          name,
          from: cleanPath,
          modelfile: `FROM ${cleanPath}`,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(await errText(res));
    } finally {
      await fs.unlink(tempModelfile).catch(() => undefined);
    }
  }
}

async function errText(res: Response): Promise<string> {
  const t = await res.text().catch(() => "");
  try { return JSON.parse(t).error ?? `${res.status} ${t}`; } catch { return t || `${res.status} ${res.statusText}`; }
}
