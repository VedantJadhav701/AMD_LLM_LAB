import type { RuntimeStatus } from "../../shared/types";
import { OllamaRuntime } from "./ollama";
import { OpenAIRuntime } from "./openai";
import { assertLoopback, type Runtime } from "./types";

const KNOWN: Array<[string, string]> = [["LM Studio", "http://127.0.0.1:1234"], ["llama.cpp server", "http://127.0.0.1:8080"], ["AMD Lemonade", "http://127.0.0.1:8000"]];

export class RuntimeRegistry {
  private runtimes = new Map<string, Runtime>();
  get(id: string): Runtime { const r = this.runtimes.get(id); if (!r) throw new Error("That runtime is no longer available. Refresh and try again."); return r; }
  all() { return [...this.runtimes.values()]; }

  async refresh(customUrl = ""): Promise<RuntimeStatus[]> {
    const candidates: Runtime[] = [new OllamaRuntime()];
    for (const [n, u] of KNOWN) candidates.push(new OpenAIRuntime(n, u));
    if (customUrl.trim()) {
      try { const u = assertLoopback(customUrl.trim()); if (!candidates.some((c) => c.baseUrl === u.origin)) candidates.push(new OpenAIRuntime("Custom server", u.origin)); } catch { /* ignored; settings UI validates */ }
    }
    const statuses = await Promise.all(candidates.map((c) => c.status()));
    this.runtimes.clear();
    candidates.forEach((c, i) => { if (statuses[i].online) this.runtimes.set(c.id, c); });
    // Always report Ollama, even offline, so the UI can explain how to start it.
    return statuses.filter((s, i) => s.online || i === 0);
  }
}
