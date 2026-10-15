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
  // --- DeepSeek Family (Reasoning, Math & Coding) ---
  { id: "deepseek-r1-distill-qwen-1.5b", name: "DeepSeek R1 Distill Qwen 1.5B", family: "DeepSeek", paramsB: 1.78, layers: 28, kvHeads: 2, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:1.5b", hf: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", tags: ["small", "reasoning", "multilingual"], source: "catalog" },
  { id: "deepseek-r1-distill-qwen-7b", name: "DeepSeek R1 Distill Qwen 7B", family: "DeepSeek", paramsB: 7.61, layers: 28, kvHeads: 4, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:7b", hf: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", tags: ["reasoning", "multilingual"], source: "catalog" },
  { id: "deepseek-r1-distill-llama-8b", name: "DeepSeek R1 Distill Llama 8B", family: "DeepSeek", paramsB: 8.03, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:8b", hf: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B", tags: ["reasoning"], source: "catalog" },
  { id: "deepseek-r1-distill-qwen-14b", name: "DeepSeek R1 Distill Qwen 14B", family: "DeepSeek", paramsB: 14.77, layers: 48, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:14b", hf: "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", tags: ["reasoning", "multilingual"], source: "catalog" },
  { id: "deepseek-r1-distill-qwen-32b", name: "DeepSeek R1 Distill Qwen 32B", family: "DeepSeek", paramsB: 32.76, layers: 64, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:32b", hf: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", tags: ["reasoning", "multilingual"], source: "catalog" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B", family: "DeepSeek", paramsB: 70.6, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "deepseek-r1:70b", hf: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B", tags: ["reasoning"], source: "catalog" },
  { id: "deepseek-coder-v2-lite", name: "DeepSeek Coder V2 Lite 16B (MoE)", family: "DeepSeek", paramsB: 15.7, activeParamsB: 2.4, layers: 27, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "deepseek-coder-v2:16b", hf: "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct", tags: ["coding", "moe"], approx: true, source: "catalog" },
  { id: "deepseek-v3", name: "DeepSeek V3 671B (MoE)", family: "DeepSeek", paramsB: 671.0, activeParamsB: 37.0, layers: 61, kvHeads: 128, headDim: 128, maxContext: 131072, ollama: "deepseek-v3", hf: "deepseek-ai/DeepSeek-V3", tags: ["reasoning", "moe"], approx: true, source: "catalog" },

  // --- Meta Llama Family ---
  dense("llama-3.2-1b", "Llama 3.2 1B Instruct", "Llama", 1.24, 16, 32, 8, 64, 2048, 8192, 128256, true, 131072, "llama3.2:1b", "meta-llama/Llama-3.2-1B-Instruct", ["small", "general"]),
  dense("llama-3.2-3b", "Llama 3.2 3B Instruct", "Llama", 3.21, 28, 24, 8, 128, 3072, 8192, 128256, true, 131072, "llama3.2:3b", "meta-llama/Llama-3.2-3B-Instruct", ["small", "general"]),
  { id: "llama-3.2-11b-vision", name: "Llama 3.2 11B Vision Instruct", family: "Llama", paramsB: 10.6, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "llama3.2-vision:11b", hf: "meta-llama/Llama-3.2-11B-Vision-Instruct", tags: ["vision", "general"], approx: true, source: "catalog" },
  dense("llama-3.1-8b", "Llama 3.1 8B Instruct", "Llama", 8.03, 32, 32, 8, 128, 4096, 14336, 128256, false, 131072, "llama3.1:8b", "meta-llama/Llama-3.1-8B-Instruct", ["general"]),
  { id: "llama-3.1-70b", name: "Llama 3.1 70B Instruct", family: "Llama", paramsB: 70.6, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "llama3.1:70b", hf: "meta-llama/Llama-3.1-70B-Instruct", tags: ["general"], source: "catalog" },
  dense("llama-3.3-70b", "Llama 3.3 70B Instruct", "Llama", 70.6, 80, 64, 8, 128, 8192, 28672, 128256, false, 131072, "llama3.3:70b", "meta-llama/Llama-3.3-70B-Instruct", ["general"]),
  { id: "codellama-7b", name: "Code Llama 7B Instruct", family: "Llama", paramsB: 6.74, layers: 32, kvHeads: 32, headDim: 128, maxContext: 16384, ollama: "codellama:7b", hf: "codellama/CodeLlama-7b-Instruct-hf", tags: ["coding"], source: "catalog" },
  { id: "codellama-13b", name: "Code Llama 13B Instruct", family: "Llama", paramsB: 13.02, layers: 40, kvHeads: 40, headDim: 128, maxContext: 16384, ollama: "codellama:13b", hf: "codellama/CodeLlama-13b-Instruct-hf", tags: ["coding"], source: "catalog" },

  // --- Alibaba Qwen Family ---
  { id: "qwen2.5-0.5b", name: "Qwen2.5 0.5B Instruct", family: "Qwen", paramsB: 0.49, layers: 24, kvHeads: 2, headDim: 64, maxContext: 32768, ollama: "qwen2.5:0.5b", hf: "Qwen/Qwen2.5-0.5B-Instruct", tags: ["small", "general", "multilingual"], source: "catalog" },
  { id: "qwen2.5-1.5b", name: "Qwen2.5 1.5B Instruct", family: "Qwen", paramsB: 1.54, layers: 28, kvHeads: 2, headDim: 128, maxContext: 32768, ollama: "qwen2.5:1.5b", hf: "Qwen/Qwen2.5-1.5B-Instruct", tags: ["small", "general", "multilingual"], source: "catalog" },
  dense("qwen2.5-3b", "Qwen2.5 3B Instruct", "Qwen", 3.09, 36, 16, 2, 128, 2048, 11008, 151936, true, 32768, "qwen2.5:3b", "Qwen/Qwen2.5-3B-Instruct", ["small", "general", "multilingual"]),
  dense("qwen2.5-7b", "Qwen2.5 7B Instruct", "Qwen", 7.61, 28, 28, 4, 128, 3584, 18944, 152064, false, 32768, "qwen2.5:7b", "Qwen/Qwen2.5-7B-Instruct", ["general", "multilingual"]),
  dense("qwen2.5-14b", "Qwen2.5 14B Instruct", "Qwen", 14.77, 48, 40, 8, 128, 5120, 13824, 152064, false, 32768, "qwen2.5:14b", "Qwen/Qwen2.5-14B-Instruct", ["general", "multilingual"]),
  dense("qwen2.5-32b", "Qwen2.5 32B Instruct", "Qwen", 32.76, 64, 40, 8, 128, 5120, 27648, 152064, false, 32768, "qwen2.5:32b", "Qwen/Qwen2.5-32B-Instruct", ["general", "multilingual"]),
  { id: "qwen2.5-72b", name: "Qwen2.5 72B Instruct", family: "Qwen", paramsB: 72.71, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "qwen2.5:72b", hf: "Qwen/Qwen2.5-72B-Instruct", tags: ["general", "multilingual"], source: "catalog" },
  { id: "qwen2.5-coder-1.5b", name: "Qwen2.5 Coder 1.5B Instruct", family: "Qwen", paramsB: 1.54, layers: 28, kvHeads: 2, headDim: 128, maxContext: 32768, ollama: "qwen2.5-coder:1.5b", hf: "Qwen/Qwen2.5-Coder-1.5B-Instruct", tags: ["small", "coding"], source: "catalog" },
  dense("qwen2.5-coder-7b", "Qwen2.5 Coder 7B Instruct", "Qwen", 7.61, 28, 28, 4, 128, 3584, 18944, 152064, false, 32768, "qwen2.5-coder:7b", "Qwen/Qwen2.5-Coder-7B-Instruct", ["coding"]),
  dense("qwen2.5-coder-14b", "Qwen2.5 Coder 14B Instruct", "Qwen", 14.77, 48, 40, 8, 128, 5120, 13824, 152064, false, 32768, "qwen2.5-coder:14b", "Qwen/Qwen2.5-Coder-14B-Instruct", ["coding"]),
  { id: "qwen2.5-coder-32b", name: "Qwen2.5 Coder 32B Instruct", family: "Qwen", paramsB: 32.76, layers: 64, kvHeads: 8, headDim: 128, maxContext: 32768, ollama: "qwen2.5-coder:32b", hf: "Qwen/Qwen2.5-Coder-32B-Instruct", tags: ["coding"], source: "catalog" },
  { id: "qwen2-vl-2b", name: "Qwen2-VL 2B Instruct", family: "Qwen", paramsB: 2.2, layers: 28, kvHeads: 2, headDim: 128, maxContext: 32768, ollama: "qwen2-vl:2b", hf: "Qwen/Qwen2-VL-2B-Instruct", tags: ["small", "vision"], approx: true, source: "catalog" },
  { id: "qwen2-vl-7b", name: "Qwen2-VL 7B Instruct", family: "Qwen", paramsB: 7.6, layers: 28, kvHeads: 4, headDim: 128, maxContext: 32768, ollama: "qwen2-vl:7b", hf: "Qwen/Qwen2-VL-7B-Instruct", tags: ["vision"], approx: true, source: "catalog" },
  dense("qwen3-1.7b", "Qwen3 1.7B", "Qwen", 1.72, 28, 16, 8, 128, 2048, 6144, 151936, true, 32768, "qwen3:1.7b", "Qwen/Qwen3-1.7B", ["small", "reasoning", "multilingual"]),
  dense("qwen3-4b", "Qwen3 4B", "Qwen", 4.02, 36, 32, 8, 128, 2560, 9728, 151936, true, 32768, "qwen3:4b", "Qwen/Qwen3-4B", ["small", "reasoning", "multilingual"]),
  dense("qwen3-8b", "Qwen3 8B", "Qwen", 8.19, 36, 32, 8, 128, 4096, 12288, 151936, false, 32768, "qwen3:8b", "Qwen/Qwen3-8B", ["reasoning", "multilingual"]),
  dense("qwen3-14b", "Qwen3 14B", "Qwen", 14.77, 40, 40, 8, 128, 5120, 17408, 151936, false, 32768, "qwen3:14b", "Qwen/Qwen3-14B", ["reasoning", "multilingual"]),
  dense("qwen3-32b", "Qwen3 32B", "Qwen", 32.76, 64, 64, 8, 128, 5120, 25600, 151936, false, 32768, "qwen3:32b", "Qwen/Qwen3-32B", ["reasoning", "multilingual"]),
  { id: "qwen3-30b-a3b", name: "Qwen3 30B-A3B (mixture of experts)", family: "Qwen", paramsB: 30.5, activeParamsB: 3.3, layers: 48, kvHeads: 4, headDim: 128, maxContext: 32768, ollama: "qwen3:30b", hf: "Qwen/Qwen3-30B-A3B", tags: ["moe", "reasoning", "multilingual"], approx: true, source: "catalog" },

  // --- Google Gemma Family ---
  { id: "gemma-2-2b", name: "Gemma 2 2B Instruct", family: "Gemma", paramsB: 2.61, layers: 26, kvHeads: 4, headDim: 256, maxContext: 8192, ollama: "gemma2:2b", hf: "google/gemma-2-2b-it", tags: ["small", "general"], source: "catalog" },
  { id: "gemma-2-9b", name: "Gemma 2 9B Instruct", family: "Gemma", paramsB: 9.24, layers: 42, kvHeads: 8, headDim: 256, maxContext: 8192, ollama: "gemma2:9b", hf: "google/gemma-2-9b-it", tags: ["general"], source: "catalog" },
  { id: "gemma-2-27b", name: "Gemma 2 27B Instruct", family: "Gemma", paramsB: 27.23, layers: 46, kvHeads: 16, headDim: 128, maxContext: 8192, ollama: "gemma2:27b", hf: "google/gemma-2-27b-it", tags: ["general"], source: "catalog" },
  { id: "codegemma-2b", name: "CodeGemma 2B", family: "Gemma", paramsB: 2.51, layers: 18, kvHeads: 1, headDim: 256, maxContext: 8192, ollama: "codegemma:2b", hf: "google/codegemma-2b", tags: ["small", "coding"], source: "catalog" },
  { id: "codegemma-7b", name: "CodeGemma 7B", family: "Gemma", paramsB: 8.54, layers: 28, kvHeads: 16, headDim: 256, maxContext: 8192, ollama: "codegemma:7b", hf: "google/codegemma-7b-it", tags: ["coding"], source: "catalog" },
  dense("gemma-3-1b", "Gemma 3 1B", "Gemma", 1.0, 26, 4, 1, 256, 1152, 6912, 262144, true, 32768, "gemma3:1b", "google/gemma-3-1b-it", ["small", "general"], GEMMA_SWA(512)),
  dense("gemma-3-4b", "Gemma 3 4B", "Gemma", 4.3, 34, 8, 4, 256, 2560, 10240, 262144, true, 131072, "gemma3:4b", "google/gemma-3-4b-it", ["small", "general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),
  dense("gemma-3-12b", "Gemma 3 12B", "Gemma", 12.2, 48, 16, 8, 256, 3840, 15360, 262144, true, 131072, "gemma3:12b", "google/gemma-3-12b-it", ["general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),
  dense("gemma-3-27b", "Gemma 3 27B", "Gemma", 27.4, 62, 32, 16, 128, 5376, 21504, 262144, true, 131072, "gemma3:27b", "google/gemma-3-27b-it", ["general", "vision", "multilingual"], { ...GEMMA_SWA(1024), extraParamsB: 0.42 }),

  // --- Mistral AI Family ---
  dense("mistral-7b", "Mistral 7B Instruct v0.3", "Mistral", 7.25, 32, 32, 8, 128, 4096, 14336, 32768, false, 32768, "mistral:7b", "mistralai/Mistral-7B-Instruct-v0.3", ["general"]),
  dense("mistral-nemo-12b", "Mistral Nemo 12B", "Mistral", 12.25, 40, 32, 8, 128, 5120, 14336, 131072, false, 131072, "mistral-nemo", "mistralai/Mistral-Nemo-Instruct-2407", ["general", "multilingual"]),
  { id: "mistral-small-24b", name: "Mistral Small 3 24B Instruct", family: "Mistral", paramsB: 24.0, layers: 40, kvHeads: 8, headDim: 128, maxContext: 32768, ollama: "mistral-small:24b", hf: "mistralai/Mistral-Small-24B-Instruct-2501", tags: ["general", "reasoning"], source: "catalog" },
  { id: "codestral-22b", name: "Codestral 22B Instruct", family: "Mistral", paramsB: 22.25, layers: 56, kvHeads: 8, headDim: 128, maxContext: 32768, ollama: "codestral:22b", hf: "mistralai/Codestral-22B-v0.1", tags: ["coding"], source: "catalog" },
  { id: "mixtral-8x7b", name: "Mixtral 8x7B Instruct (MoE)", family: "Mistral", paramsB: 46.7, activeParamsB: 12.9, layers: 32, kvHeads: 8, headDim: 128, maxContext: 32768, ollama: "mixtral:8x7b", hf: "mistralai/Mixtral-8x7B-Instruct-v0.1", tags: ["moe", "general"], approx: true, source: "catalog" },
  { id: "mixtral-8x22b", name: "Mixtral 8x22B Instruct (MoE)", family: "Mistral", paramsB: 141.0, activeParamsB: 39.0, layers: 56, kvHeads: 8, headDim: 128, maxContext: 65536, ollama: "mixtral:8x22b", hf: "mistralai/Mixtral-8x22B-Instruct-v0.1", tags: ["moe", "general"], approx: true, source: "catalog" },

  // --- Microsoft Phi Family ---
  dense("phi-4-mini", "Phi-4 mini 3.8B", "Phi", 3.84, 32, 24, 8, 128, 3072, 8192, 200064, true, 131072, "phi4-mini", "microsoft/Phi-4-mini-instruct", ["small", "reasoning"]),
  dense("phi-4", "Phi-4 14B", "Phi", 14.66, 40, 40, 10, 128, 5120, 17920, 100352, false, 16384, "phi4", "microsoft/phi-4", ["reasoning"]),
  { id: "phi-3.5-mini", name: "Phi-3.5 mini 3.8B", family: "Phi", paramsB: 3.82, layers: 32, kvHeads: 32, headDim: 96, maxContext: 131072, ollama: "phi3.5", hf: "microsoft/Phi-3.5-mini-instruct", tags: ["small", "reasoning"], source: "catalog" },
  { id: "phi-3.5-moe", name: "Phi-3.5 MoE 16x3.8B", family: "Phi", paramsB: 41.9, activeParamsB: 6.6, layers: 32, kvHeads: 8, headDim: 96, maxContext: 131072, ollama: "phi3.5:moe", hf: "microsoft/Phi-3.5-MoE-instruct", tags: ["moe", "reasoning"], approx: true, source: "catalog" },

  // --- 01.AI & Open Community Models ---
  { id: "yi-1.5-6b", name: "Yi-1.5 6B Chat", family: "Yi", paramsB: 6.0, layers: 32, kvHeads: 4, headDim: 128, maxContext: 32768, ollama: "yi:6b", hf: "01-ai/Yi-1.5-6B-Chat", tags: ["general"], source: "catalog" },
  { id: "yi-1.5-9b", name: "Yi-1.5 9B Chat", family: "Yi", paramsB: 8.8, layers: 48, kvHeads: 4, headDim: 128, maxContext: 32768, ollama: "yi:9b", hf: "01-ai/Yi-1.5-9B-Chat", tags: ["general"], source: "catalog" },
  { id: "hermes-3-8b", name: "Hermes 3 (Llama 3.1 8B)", family: "Nous", paramsB: 8.03, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131072, ollama: "hermes3:8b", hf: "NousResearch/Hermes-3-Llama-3.1-8B", tags: ["general", "reasoning"], source: "catalog" },
  { id: "starcoder2-3b", name: "StarCoder 2 3B", family: "StarCoder", paramsB: 3.03, layers: 30, kvHeads: 2, headDim: 128, maxContext: 16384, ollama: "starcoder2:3b", hf: "bigcode/starcoder2-3b", tags: ["small", "coding"], source: "catalog" },
  { id: "starcoder2-7b", name: "StarCoder 2 7B", family: "StarCoder", paramsB: 7.24, layers: 32, kvHeads: 4, headDim: 128, maxContext: 16384, ollama: "starcoder2:7b", hf: "bigcode/starcoder2-7b", tags: ["coding"], source: "catalog" },
  { id: "falcon-2-11b", name: "Falcon 2 11B", family: "Falcon", paramsB: 11.0, layers: 60, kvHeads: 8, headDim: 64, maxContext: 8192, ollama: "falcon2:11b", hf: "tiiuae/falcon-11B", tags: ["general"], approx: true, source: "catalog" },

  // --- Experimental Native Formats ---
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
