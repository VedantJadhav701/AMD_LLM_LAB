import type { BenchResult, MachineProfile } from "../shared/types";
import { findModel } from "../core/catalog";

export interface HubPayload {
  client_version: string;
  hardware: { gpu_name: string; vram_gb: number; os?: string; memory_bandwidth_gbps?: number };
  software: { stack: string; stack_version?: string };
  model: { hf_model_id: string; params_b: number; precision: string; quantization?: string };
  run: { batch_size: number; context_tokens: number; output_tokens: number };
  outcome: "ok";
  results: { steady_vram_gb?: number; decode_tok_s: number; prefill_tok_s?: number; ttft_s?: number };
  notes?: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Builds exactly what would be sent, or says why this run cannot be shared. Nothing here identifies the user. */
export function buildHubPayload(res: BenchResult, machine: MachineProfile, version: string): { payload: HubPayload } | { error: string } {
  if (!res.decodeTokS) return { error: "This run has no speed measurement." };
  const spec = res.catalogId ? findModel(res.catalogId) : undefined;
  if (!spec?.hf) return { error: "Only runs of catalog models (with a Hugging Face id) can be shared, so results stay comparable." };
  const g = machine.gpus.find((x) => x.kind === "discrete" || x.kind === "apple") ?? machine.gpus[0];
  if (!g) return { error: "The community hub compares GPU runs, and no GPU was detected." };
  const vram = g.dedicatedGiB ?? (machine.unified ? machine.ram.totalGiB : g.sharedGiB);
  if (!vram) return { error: "GPU memory size is unknown. Enter it in Settings and run again." };
  const gpuFrac = res.placement.gpuFraction;
  if (gpuFrac !== null && gpuFrac < 0.95) return { error: "Only runs fully on the GPU can be shared, because partial offload would distort the rankings." };
  const mem = res.placement.vramGiB ?? res.placement.sizeGiB;
  if (!mem) return { error: "The runtime did not report how much memory the model used." };
  const q = (res.quant ?? "Q4_K_M").toUpperCase();
  return {
    payload: {
      client_version: version.slice(0, 20),
      hardware: { gpu_name: g.name.slice(0, 80), vram_gb: r2(vram), os: `${machine.platform} ${machine.arch}`.slice(0, 60), ...(g.bandwidthGBps ? { memory_bandwidth_gbps: g.bandwidthGBps } : {}) },
      software: { stack: res.runtimeName.slice(0, 40) },
      model: { hf_model_id: spec.hf, params_b: r2(res.paramsB ?? spec.paramsB), precision: q.slice(0, 16), quantization: q },
      run: { batch_size: 1, context_tokens: res.ctx, output_tokens: 128 },
      outcome: "ok",
      results: { steady_vram_gb: r2(Math.min(mem, vram)), decode_tok_s: r2(res.decodeTokS), ...(res.prefillTokS ? { prefill_tok_s: r2(res.prefillTokS) } : {}), ...(res.ttftS ? { ttft_s: r2(res.ttftS) } : {}) },
      notes: "Measured with AMD LLM Lab desktop",
    },
  };
}

export async function submitToHub(hubUrl: string, payload: HubPayload): Promise<{ id: string; status: string; reasons: string[] }> {
  let u: URL;
  try { u = new URL(hubUrl); } catch { throw new Error("The hub address in Settings is not a valid URL."); }
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new Error("The hub address must use https.");
  const res = await fetch(`${u.origin}${u.pathname.replace(/\/$/, "")}/submissions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const body = (await res.json().catch(() => ({}))) as { id?: string; status?: string; reasons?: string[]; detail?: unknown };
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `The hub rejected this run (${res.status}).`);
  return { id: body.id ?? "", status: body.status ?? "community", reasons: body.reasons ?? [] };
}
