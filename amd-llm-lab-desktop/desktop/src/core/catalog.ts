import type { ModelSpec } from "../shared/types";

// Architecture numbers are copied from each model's published config.json. Dense models carry the
// extra `derive` block so a unit test can recompute the parameter count and catch typos.
// Mixture-of-experts and a few multimodal entries are marked `approx`.

const dense = (
  id: string, name: string, family: string, paramsB: number,
  layers: number, heads: number, kvHeads: number, headDim: number,
  hidden: number, intermediate: number, vocab: number, tied: boolean,
  maxContext: number, ollama: string, hf: string, tags: ModelSpec["tags"],
  extra: Partial<ModelSpec> = {},
): ModelSpec => ({
  id, name, family, paramsB, layers, kvHeads, headDim, maxContext, ollama, hf, tags,
  derive: { hidden, heads, intermediate, vocab, tiedEmbeddings: tied },
  source: "catalog",
  ...extra,
});

const GEMMA_SWA = (window: number) => ({ slidingWindow: { fraction: 5 / 6, window } });

export const CATALOG: ModelSpec[] = [
  dense("llama-3.2-1b", "Llama 3.2 1B Instruct", "Llama", 1.24, 16, 32, 8, 64, 2048, 8192, 128256, true, 131072, "llama3.2:1b", "meta-llama/Llama-3.2-1B-Instruct", ["small", "general"]),
  dense("llama-3.2-3b", "Llama 3.2 3B Instruct", "Llama", 3.21, 28, 24, 8, 128, 3072, 8192, 128256, true, 131072, "llama3.2:3b", "meta-llama/Llama-3.2-3B-Instruct", ["small", "general"]),
  dense("llama-3.1-8b", "Llama 3.1 8B Instruct", "Llama", 8.03, 32, 32, 8, 128, 4096, 14336, 128256, false, 131072, "llama3.1:8b", "meta-llama/Llama-3.1-8B-Instruct", ["general"]),
  dense("llama-3.3-70b", "Llama 3.3 70B Instruct", "Llama", 70.6, 80, 64, 8, 128, 8192, 28672, 128256, false, 131072, "llama3.3:70b", "meta-llama/Llama-3.3-70B-Instruct", ["general"]),

  dense("qwen2.5-3b", "Qwen2.5 3B Instruct", "Qwen", 3.09, 36, 16, 2, 128, 2048, 11008, 151936, true, 32768, "qwen2.5:3b", "Qwen/Qwen2.5-3B-Instruct", ["small", "general", "multilingual"]),
  dense("qwen2.5-7b", "Qwen2.5 7B Instruct", "Qwen", 7.61, 28, 28, 4, 128, 3584, 18944, 152064, false, 32768, "qwen2.5:7b", "Qwen/Qwen2.5-7B-Instruct", ["general", "multilingual"]),
  dense("qwen2.5-14b", "Qwen2.5 14B Instruct", "Qwen", 14.77, 48, 40, 8, 128, 5120, 13824, 152064, false, 32768, "qwen2.5:14b", "Qwen/Qwen2.5-14B-Instruct", ["general", "multilingual"]),
  dense("qwen2.5-32b", "Qwen2.5 32B Instruct", "Qwen", 32.76, 64, 40, 8, 128, 5120, 27648, 152064, false, 32768, "qwen2.5:32b", "Qwen/Qwen2.5-32B-Instruct", ["general", "multilingual"]),
  dense("qwen2.5-coder-7b", "Qwen2.5 Coder 7B Instruct", "Qwen", 7.61, 28, 28, 4, 128, 3584, 18944, 152064, false, 32768, "qwen2.5-coder:7b", "Qwen/Qwen2.5-Coder-7B-Instruct", ["coding"]),
  dense("qwen2.5-coder-14b", "Qwen2.5 Coder 14B Instruct", "Qwen", 14.77, 48, 40, 8, 128, 5120, 13824, 152064, false, 32768, "qwen2.5-coder:14b", "Qwen/Qwen2.5-Coder-14B-Instruct", ["coding"]),

  dense("qwen3-1.7b", "Qwen3 1.7B", "Qwen", 1.72, 28, 16, 8, 128, 2048, 6144, 151936, true, 32768, "qwen3:1.7b", "Qwen/Qwen3-1.7B", ["small", "reasoning", "multilingual"]),
  dense("qwen3-4b", "Qwen3 4B", "Qwen", 4.02, 36, 32, 8, 128, 2560, 9728, 151936, true, 32768, "qwen3:4b", "Qwen/Qwen3-4B", ["small", "reasoning", "multilingual"]),
  dense("qwen3-8b", "Qwen3 8B", "Qwen", 8.19, 36, 32, 8, 128, 4096, 12288, 151936, false, 32768, "qwen3:8b", "Qwen/Qwen3-8B", ["reasoning", "multilingual"]),
  dense("qwen3-14b", "Qwen3 14B", "Qwen", 14.77, 40, 40, 8, 128, 5120, 17408, 151936, false, 32768, "qwen3:14b", "Qwen/Qwen3-14B", ["reasoning", "multilingual"]),
  dense("qwen3-32b", "Qwen3 32B", "Qwen", 32.76, 64, 64, 8, 128, 5120, 25600, 151936, false, 32768, "qwen3:32b", "Qwen/Qwen3-32B", ["reasoning", "multilingual"]),
  {
    id: "qwen3-30b-a3b", name: "Qwen3 30B-A3B (mixture of experts)", family: "Qwen", paramsB: 30.5, activeParamsB: 3.3,
    layers: 48, kvHeads: 4, headDim: 128, maxContext: 32768, ollama: "qwen3:30b", hf: "Qwen/Qwen3-30B-A3B",
    tags: ["moe", "reasoning", "multilingual"], approx: true, source: "catalog",
  },

  dense("gemma-3-1b", "Gemma 3 1B", "Gemma", 1.0, 26, 4, 1, 256, 1152, 6912, 262144, true, 32768, "gemma3:1b", "google/gemma-3-1b-it", ["small", "general"], GEMMA_SWA(512)),
  dense("gemma-3-4b", "Gemma 3 4B", "Gemma", 4.3, 34, 8, 4, 256, 2560, 10240, 262144, true, 131072, "gemma3:4b", "google/gemma-3-4b-it", ["small", "general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),
  dense("gemma-3-12b", "Gemma 3 12B", "Gemma", 12.2, 48, 16, 8, 256, 3840, 15360, 262144, true, 131072, "gemma3:12b", "google/gemma-3-12b-it", ["general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),
  dense("gemma-3-27b", "Gemma 3 27B", "Gemma", 27.4, 62, 32, 16, 128, 5376, 21504, 262144, true, 131072, "gemma3:27b", "google/gemma-3-27b-it", ["general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),

  dense("phi-4-mini", "Phi-4 mini 3.8B", "Phi", 3.84, 32, 24, 8, 128, 3072, 8192, 200064, true, 131072, "phi4-mini", "microsoft/Phi-4-mini-instruct", ["small", "reasoning"]),
  dense("phi-4", "Phi-4 14B", "Phi", 14.66, 40, 40, 10, 128, 5120, 17920, 100352, false, 16384, "phi4", "microsoft/phi-4", ["reasoning"]),
  dense("mistral-7b", "Mistral 7B Instruct v0.3", "Mistral", 7.25, 32, 32, 8, 128, 4096, 14336, 32768, false, 32768, "mistral:7b", "mistralai/Mistral-7B-Instruct-v0.3", ["general"]),
  dense("mistral-nemo-12b", "Mistral Nemo 12B", "Mistral", 12.25, 40, 32, 8, 128, 5120, 14336, 131072, false, 131072, "mistral-nemo", "mistralai/Mistral-Nemo-Instruct-2407", ["general", "multilingual"]),

  {
    id: "gpt-oss-20b", name: "gpt-oss 20B (mixture of experts)", family: "gpt-oss", paramsB: 20.9, activeParamsB: 3.6,
    layers: 24, kvHeads: 8, headDim: 64, maxContext: 131072, slidingWindow: { fraction: 0.5, window: 128 },
    onlyQuant: "MXFP4", fixedFileGiB: 13.0, ollama: "gpt-oss:20b", hf: "openai/gpt-oss-20b",
    tags: ["moe", "reasoning"], approx: true, source: "catalog",
  },
  {
    id: "gpt-oss-120b", name: "gpt-oss 120B (mixture of experts)", family: "gpt-oss", paramsB: 116.8, activeParamsB: 5.1,
    layers: 36, kvHeads: 8, headDim: 64, maxContext: 131072, slidingWindow: { fraction: 0.5, window: 128 },
    onlyQuant: "MXFP4", fixedFileGiB: 60.5, ollama: "gpt-oss:120b", hf: "openai/gpt-oss-120b",
    tags: ["moe", "reasoning"], approx: true, source: "catalog",
  },
];

export function findModel(id: string): ModelSpec | undefined {
  return CATALOG.find((m) => m.id === id);
}

/** Match an installed runtime model name (for example "llama3.1:8b-instruct-q4_K_M") to the catalog. */
export function matchInstalledName(name: string): ModelSpec | undefined {
  const base = name.toLowerCase().replace(/^hf\.co\//, "");
  const exact = CATALOG.find((m) => m.ollama && base === m.ollama.toLowerCase());
  if (exact) return exact;
  const [repo, tag = "latest"] = base.split(":");
  const sizeInTag = /(\d+(?:\.\d+)?)b/.exec(tag)?.[0];
  return CATALOG.find((m) => {
    if (!m.ollama) return false;
    const [mRepo, mTag = "latest"] = m.ollama.toLowerCase().split(":");
    if (mRepo !== repo) return false;
    const mSize = /(\d+(?:\.\d+)?)b/.exec(mTag)?.[0];
    if (mSize && sizeInTag) return mSize === sizeInTag;
    return mTag === tag || (tag === "latest" && !mSize);
  });
}
