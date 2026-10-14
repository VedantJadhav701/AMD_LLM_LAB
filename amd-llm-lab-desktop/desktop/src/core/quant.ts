import type { ModelSpec, QuantId } from "../shared/types";

export const GIB = 1024 ** 3;
/** One GiB expressed in decimal GB, for converting to bandwidth in GB/s. */
export const GIB_TO_GB = GIB / 1e9;

export interface QuantInfo {
  id: QuantId;
  label: string;
  /** Effective bits per weight in real GGUF files (includes scales and mixed-precision tensors). */
  bpw: number;
  /** 0..1 multiplier used only when ranking models by expected capability. */
  quality: number;
  tier: "lossless" | "near-lossless" | "small loss" | "noticeable loss" | "large loss";
  blurb: string;
}

// bits per weight come from the llama.cpp quantize table for an 8B model (file size / parameters).
export const QUANTS: Record<QuantId, QuantInfo> = {
  F16: { id: "F16", label: "F16", bpw: 16, quality: 1.0, tier: "lossless", blurb: "Full 16-bit weights. Rarely worth it on a laptop." },
  Q8_0: { id: "Q8_0", label: "Q8_0", bpw: 8.5, quality: 0.995, tier: "lossless", blurb: "Practically identical to the original model." },
  Q6_K: { id: "Q6_K", label: "Q6_K", bpw: 6.56, quality: 0.985, tier: "near-lossless", blurb: "Very close to the original." },
  Q5_K_M: { id: "Q5_K_M", label: "Q5_K_M", bpw: 5.7, quality: 0.97, tier: "near-lossless", blurb: "A tiny quality cost for a large saving." },
  Q4_K_M: { id: "Q4_K_M", label: "Q4_K_M", bpw: 4.9, quality: 0.95, tier: "small loss", blurb: "The usual default. Small, hard-to-notice loss." },
  Q3_K_M: { id: "Q3_K_M", label: "Q3_K_M", bpw: 3.9, quality: 0.87, tier: "noticeable loss", blurb: "Noticeably weaker. Use only if Q4 will not fit." },
  Q2_K: { id: "Q2_K", label: "Q2_K", bpw: 3.2, quality: 0.7, tier: "large loss", blurb: "Large quality loss. Last resort." },
  MXFP4: { id: "MXFP4", label: "MXFP4", bpw: 4.5, quality: 0.97, tier: "near-lossless", blurb: "The model's native 4-bit format." },
};

export const GENERIC_QUANTS: QuantId[] = ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"];

export function quantsFor(model: ModelSpec): QuantId[] {
  return model.onlyQuant ? [model.onlyQuant] : GENERIC_QUANTS;
}

/** Size of the weights file in GiB. */
export function weightsGiB(model: ModelSpec, quant: QuantId): number {
  if (model.fixedFileGiB && model.onlyQuant === quant) return model.fixedFileGiB;
  return (model.paramsB * 1e9 * QUANTS[quant].bpw) / 8 / GIB;
}

/** Weights read for every generated token. Mixture-of-experts models only touch their active experts. */
export function streamedWeightsGiB(model: ModelSpec, quant: QuantId): number {
  const total = weightsGiB(model, quant);
  if (!model.activeParamsB) return total;
  return total * Math.min(1, model.activeParamsB / model.paramsB);
}

/** KV cache size in GiB for a context length. kvBytes is 2 for f16, about 1.06 for q8_0. */
export function kvGiB(model: ModelSpec, ctx: number, kvBytes = 2): number {
  const perToken = 2 * model.layers * model.kvHeads * model.headDim * kvBytes;
  const sw = model.slidingWindow;
  const effectiveTokens = sw ? (1 - sw.fraction) * ctx + sw.fraction * Math.min(ctx, sw.window) : ctx;
  return (perToken * effectiveTokens) / GIB;
}

/** Compute buffers and runtime allocations that scale a little with context. */
export function overheadGiB(ctx: number): number {
  return 0.5 + 0.02 * (ctx / 1024);
}

/** Parameter count of a dense gated-MLP decoder, in billions. Used to cross-check catalog numbers. */
export function denseParamsB(d: NonNullable<ModelSpec["derive"]>, layers: number, kvHeads: number, headDim: number): number {
  const attn = d.hidden * d.heads * headDim * 2 + d.hidden * kvHeads * headDim * 2;
  const mlp = 3 * d.hidden * d.intermediate;
  const emb = d.vocab * d.hidden * (d.tiedEmbeddings ? 1 : 2);
  return (layers * (attn + mlp) + emb) / 1e9;
}
