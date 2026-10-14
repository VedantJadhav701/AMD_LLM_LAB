import type { ModelSpec } from "../shared/types";
import { denseParamsB } from "./quant";

export interface HfConfig { [k: string]: unknown }

const n = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);

/** Accepts "owner/name", a full huggingface.co URL, or an ollama-style name is rejected. */
export function parseHfId(input: string): string | null {
  const s = input.trim().replace(/^https?:\/\/(www\.)?huggingface\.co\//i, "").replace(/\/(tree|blob|resolve)\/.*$/, "").replace(/\/+$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}

/** Many multimodal configs nest the language model under text_config. */
function textConfig(c: HfConfig): HfConfig { const t = c.text_config; return t && typeof t === "object" ? { ...c, ...(t as HfConfig) } : c; }

export interface DerivedSpec { spec: ModelSpec; warnings: string[] }

export function deriveSpec(hfId: string, config: HfConfig, apiParamsTotal?: number | null): DerivedSpec | { error: string } {
  const c = textConfig(config);
  const layers = n(c.num_hidden_layers), heads = n(c.num_attention_heads), hidden = n(c.hidden_size);
  if (!layers || !heads || !hidden) return { error: "This repository does not look like a standard transformer (no layer / head / hidden-size fields)." };
  const kvHeads = n(c.num_key_value_heads) ?? heads;
  const headDim = n(c.head_dim) ?? Math.round(hidden / heads);
  const warnings: string[] = [];
  const experts = n(c.num_experts) ?? n(c.num_local_experts) ?? n(c.n_routed_experts);
  const perTok = n(c.num_experts_per_tok);
  const inter = n(c.intermediate_size) ?? hidden * 4;
  const vocab = n(c.vocab_size) ?? 32000;
  const tied = c.tie_word_embeddings === true;
  const approxDense = denseParamsB({ hidden, heads, intermediate: inter, vocab, tiedEmbeddings: tied }, layers, kvHeads, headDim);

  let paramsB: number, activeParamsB: number | undefined, approx = false;
  if (experts && perTok) {
    const moeInter = n(c.moe_intermediate_size) ?? inter;
    const attn = layers * (hidden * heads * headDim * 2 + hidden * kvHeads * headDim * 2);
    const emb = vocab * hidden * (tied ? 1 : 2);
    const expertP = 3 * hidden * moeInter;
    const total = (attn + emb + layers * experts * expertP) / 1e9;
    const active = (attn + emb + layers * perTok * expertP) / 1e9;
    paramsB = apiParamsTotal ? apiParamsTotal / 1e9 : total;
    activeParamsB = Math.min(paramsB, active * (paramsB / total));
    approx = true;
    warnings.push("Mixture-of-experts: active parameters are estimated from the config.");
  } else {
    paramsB = apiParamsTotal ? apiParamsTotal / 1e9 : approxDense;
    if (!apiParamsTotal) { approx = true; warnings.push("Parameter count is estimated from the architecture because the repository did not report one."); }
    else if (Math.abs(approxDense - paramsB) / paramsB > 0.12) warnings.push("The architecture suggests a different size than the repository reports; the reported size is used.");
  }
  const win = n(c.sliding_window);
  const layerTypes = Array.isArray(c.layer_types) ? (c.layer_types as string[]) : null;
  let slidingWindow: ModelSpec["slidingWindow"];
  if (win && layerTypes) { const f = layerTypes.filter((t) => /sliding/.test(t)).length / layerTypes.length; if (f > 0) slidingWindow = { fraction: f, window: win }; }
  else if (win && c.use_sliding_window === true) slidingWindow = { fraction: 1, window: win };
  const maxContext = n(c.max_position_embeddings) ?? 8192;
  const name = hfId.split("/")[1];
  return {
    spec: {
      id: `hf:${hfId}`, name, family: (typeof c.model_type === "string" ? c.model_type : "custom"), paramsB, activeParamsB, layers, kvHeads, headDim, maxContext: Math.min(maxContext, 1_048_576),
      slidingWindow, hf: hfId, tags: activeParamsB ? ["moe"] : ["general"], approx, source: "huggingface",
    },
    warnings,
  };
}
