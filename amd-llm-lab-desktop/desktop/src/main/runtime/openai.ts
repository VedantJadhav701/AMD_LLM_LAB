import type { ChatMessage, GenStats, InstalledModel, Placement, RuntimeStatus } from "../../shared/types";
import { matchInstalledName } from "../../core/catalog";
import { assertLoopback, fetchJson, lines, type GenOptions, type Runtime } from "./types";

/** Any OpenAI-compatible local server: LM Studio, llama.cpp llama-server, AMD Lemonade, vLLM, ... */
export class OpenAIRuntime implements Runtime {
  readonly kind = "openai" as const;
  readonly id: string;
  readonly baseUrl: string;
  constructor(public readonly name: string, baseUrl: string) { this.baseUrl = assertLoopback(baseUrl).origin; this.id = `openai@${this.baseUrl}`; }
  private url(p: string) { return `${this.baseUrl}${p}`; }

  async status(): Promise<RuntimeStatus> {
    const base = { id: this.id, name: this.name, kind: this.kind, baseUrl: this.baseUrl };
    for (const p of ["/v1/models", "/api/v1/models"]) {
      try { await fetchJson(this.url(p), { timeoutMs: 1500 }); return { ...base, online: true }; } catch { /* try next */ }
    }
    return { ...base, online: false, error: "No response" };
  }

  async list(): Promise<InstalledModel[]> {
    let data: { data?: Array<{ id: string }> } = {};
    for (const p of ["/v1/models", "/api/v1/models"]) { try { data = await fetchJson(this.url(p)); break; } catch { /* next */ } }
    return (data.data ?? []).map((m) => ({ runtimeId: this.id, name: m.id, sizeGiB: null, paramsB: null, quant: /(q\d_[a-z0-9_]+|f16|bf16)/i.exec(m.id)?.[1]?.toUpperCase() ?? null, family: null, catalogId: matchInstalledName(m.id)?.id ?? null }));
  }

  async placement(): Promise<Placement | null> { return null; }

  async chat(model: string, messages: ChatMessage[], opts: GenOptions, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenStats> {
    const t0 = performance.now();
    const res = await fetch(this.url("/v1/chat/completions"), {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, max_tokens: opts.maxTokens ?? undefined, temperature: opts.temperature ?? 0.7 }),
    });
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || `${res.status} ${res.statusText}`);
    let chunks = 0, first: number | null = null, last = t0;
    let usage: { completion_tokens?: number; prompt_tokens?: number } | null = null;
    let timings: { predicted_per_second?: number; prompt_per_second?: number; predicted_n?: number; prompt_n?: number } | null = null;
    for await (const l of lines(res)) {
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (d === "[DONE]") break;
      try {
        const j = JSON.parse(d);
        if (j.usage) usage = j.usage;
        if (j.timings) timings = j.timings;
        const c = j.choices?.[0]?.delta?.content;
        if (c) { const now = performance.now(); if (first === null) first = now; last = now; chunks++; onToken(c); }
      } catch { /* ignore keep-alives */ }
    }
    const tokens = usage?.completion_tokens ?? timings?.predicted_n ?? chunks;
    const decodeS = first !== null && last > first ? (last - first) / 1000 : null;
    // Streaming chunks may batch tokens, so the decode window excludes the first token and counts the rest.
    const measured = decodeS && tokens > 1 ? (tokens - 1) / decodeS : null;
    return {
      tokens, decodeTokS: timings?.predicted_per_second ?? measured, promptTokens: usage?.prompt_tokens ?? timings?.prompt_n ?? null,
      prefillTokS: timings?.prompt_per_second ?? null, ttftS: first !== null ? (first - t0) / 1000 : null, loadS: null, totalS: (performance.now() - t0) / 1000,
    };
  }
}
