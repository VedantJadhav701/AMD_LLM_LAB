import { describe, expect, it } from "vitest";
import { CATALOG, findModel, matchInstalledName } from "../src/core/catalog";
import { denseParamsB, kvGiB, quantsFor, weightsGiB } from "../src/core/quant";

describe("catalog", () => {
  it("has unique ids and sane numbers", () => {
    expect(new Set(CATALOG.map((m) => m.id)).size).toBe(CATALOG.length);
    for (const m of CATALOG) {
      expect(m.paramsB).toBeGreaterThan(0.3);
      expect(m.layers).toBeGreaterThan(8);
      expect(m.headDim).toBeGreaterThanOrEqual(64);
      if (m.activeParamsB) expect(m.activeParamsB).toBeLessThan(m.paramsB);
    }
  });

  it("dense parameter counts recompute from the architecture within 3%", () => {
    const dense = CATALOG.filter((m) => m.derive);
    expect(dense.length).toBeGreaterThan(20);
    for (const m of dense) {
      const derived = denseParamsB(m.derive!, m.layers, m.kvHeads, m.headDim);
      const declared = m.paramsB - (m.extraParamsB ?? 0);
      expect(Math.abs(derived - declared) / declared, `${m.id}: derived ${derived.toFixed(2)}B vs ${declared}B`).toBeLessThan(0.03);
    }
  });

  it("matches published reference sizes", () => {
    const llama8 = findModel("llama-3.1-8b")!;
    // llama.cpp lists Llama-3-8B Q4_K_M at 4.58 GiB and Q8_0 at 7.96 GiB
    expect(weightsGiB(llama8, "Q4_K_M")).toBeCloseTo(4.58, 0);
    expect(weightsGiB(llama8, "Q8_0")).toBeCloseTo(7.96, 0);
    // 8192 tokens of f16 KV cache for Llama 3.1 8B is 1 GiB
    expect(kvGiB(llama8, 8192)).toBeCloseTo(1.0, 2);
  });

  it("sliding-window attention shrinks the KV cache and the formula stays linear otherwise", () => {
    const g = findModel("gemma-3-27b")!;
    const naive = (2 * g.layers * g.kvHeads * g.headDim * 2 * 32768) / 1024 ** 3;
    expect(kvGiB(g, 32768)).toBeLessThan(naive / 3);
    const q = findModel("qwen2.5-7b")!;
    expect(kvGiB(q, 8192)).toBeCloseTo(2 * kvGiB(q, 4096), 6);
  });

  it("native-format models only offer their own quant", () => {
    expect(quantsFor(findModel("gpt-oss-20b")!)).toEqual(["MXFP4"]);
    expect(weightsGiB(findModel("gpt-oss-20b")!, "MXFP4")).toBe(13.0);
    expect(quantsFor(findModel("qwen3-8b")!).length).toBeGreaterThan(4);
  });

  it("maps installed runtime names to catalog entries", () => {
    expect(matchInstalledName("llama3.1:8b")?.id).toBe("llama-3.1-8b");
    expect(matchInstalledName("qwen2.5:7b-instruct-q4_K_M")?.id).toBe("qwen2.5-7b");
    expect(matchInstalledName("qwen3:30b")?.id).toBe("qwen3-30b-a3b");
    expect(matchInstalledName("gemma3:12b")?.id).toBe("gemma-3-12b");
    expect(matchInstalledName("totally-unknown:1b")).toBeUndefined();
  });
});

import { deriveSpec, parseHfId } from "../src/core/hfspec";
describe("hugging face spec derivation", () => {
  it("parses ids and urls", () => {
    expect(parseHfId("https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/tree/main")).toBe("Qwen/Qwen2.5-7B-Instruct");
    expect(parseHfId("llama3.1:8b")).toBeNull();
  });
  it("reproduces Llama 3.1 8B from its real config within 3%", () => {
    const d = deriveSpec("meta-llama/Llama-3.1-8B-Instruct", { num_hidden_layers: 32, num_attention_heads: 32, num_key_value_heads: 8, hidden_size: 4096, intermediate_size: 14336, vocab_size: 128256, max_position_embeddings: 131072, model_type: "llama" });
    if ("error" in d) throw new Error(d.error);
    expect(Math.abs(d.spec.paramsB - 8.03) / 8.03).toBeLessThan(0.03);
    expect(d.spec.kvHeads).toBe(8); expect(d.spec.headDim).toBe(128); expect(d.spec.approx).toBe(true);
  });
  it("prefers the repository's reported size and flags MoE", () => {
    const d = deriveSpec("Qwen/Qwen3-30B-A3B", { num_hidden_layers: 48, num_attention_heads: 32, num_key_value_heads: 4, head_dim: 128, hidden_size: 2048, intermediate_size: 6144, moe_intermediate_size: 768, num_experts: 128, num_experts_per_tok: 8, vocab_size: 151936, max_position_embeddings: 40960 }, 30.5e9);
    if ("error" in d) throw new Error(d.error);
    expect(d.spec.paramsB).toBeCloseTo(30.5, 1);
    expect(d.spec.activeParamsB!).toBeGreaterThan(2); expect(d.spec.activeParamsB!).toBeLessThan(5);
  });
  it("rejects non-transformer repos", () => {
    expect("error" in deriveSpec("a/b", { foo: 1 })).toBe(true);
  });
});
