// Typed client for the memory-fit and community-hub endpoints.
// Point NEXT_PUBLIC_API_URL at your FastAPI server; it defaults to the local one.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type Precision = "BF16" | "FP16" | "INT8" | "INT4" | "INT2";

export interface FitRequest {
  hf_model_id?: string;
  params_b?: number;
  precision: Precision;
  context_tokens: number;
  batch_size: number;
  device_vram_gb?: number;
  memory_bandwidth_gbps?: number;
}

export interface FitResponse {
  model: string;
  params_b: number;
  params_source: "config" | "override" | "spec";
  precision: string;
  weights_gb: number;
  kv_cache_gb: number;
  overhead_gb: number;
  total_gb: number;
  verdict: "fits" | "tight" | "does_not_fit" | null;
  headroom_gb: number | null;
  max_context_tokens: number | null;
  decode_tok_s_ceiling: number | null;
  warnings: string[];
}

export interface LeaderboardRow {
  gpu: string;
  stack: string;
  model: string;
  precision: string;
  runs: number;
  decode_tok_s: number;
  best_decode_tok_s: number;
  steady_vram_gb: number | null;
  run_peak_vram_gb: number | null;
  efficiency: number | null;
  verified: boolean;
}

export interface HubStats {
  submissions: number;
  verified: number;
  community: number;
  gpus: string[];
  stacks: string[];
  models: string[];
  contexts: number[];
}

export interface LocalGpu {
  gpu: { available: boolean; name: string | null; vram_gb: number | null };
}

export interface AdviseRequest {
  vram_gb: number;
  gpu_name?: string;
  memory_bandwidth_gbps?: number;
  context_tokens: number;
  batch_size: number;
  goal: "biggest_model" | "fastest" | "longest_context";
  min_decode_tok_s?: number;
  limit?: number;
}

export interface AdviseOption {
  rank: number;
  model: string;
  params_b: number;
  precision: string;
  verdict: "fits" | "tight";
  total_gb: number;
  headroom_gb: number;
  max_context_tokens: number;
  speed: null | {
    source: "measured" | "estimated" | "ceiling";
    tok_s: number;
    low: number | null;
    high: number | null;
    runs: number | null;
    verified: boolean | null;
    note: string;
  };
}

export interface AdviseResponse {
  options: AdviseOption[];
  considered: number;
  too_big: number;
  below_speed_target: number;
  measured_count: number;
  notes: string[];
}

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Can't reach the API at ${API_BASE}. Start the backend or set NEXT_PUBLIC_API_URL.`);
  }
  if (!response.ok) {
    let message = `The API returned ${response.status}.`;
    try {
      const body = await response.json();
      const detail = body?.error?.details;
      message = Array.isArray(detail)
        ? detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
        : body?.error?.message ?? message;
    } catch {
      /* keep generic message */
    }
    throw new ApiError(message);
  }
  return response.json() as Promise<T>;
}

const BYTES_PER_WEIGHT: Record<string, number> = {
  BF16: 2.0,
  FP16: 2.0,
  INT8: 1.05,
  INT4: 0.55,
  INT2: 0.30,
};

function parseParamsFromModelId(id: string): number {
  const match = id.match(/(\d+(?:\.\d+)?)[bB]/);
  if (match) return parseFloat(match[1]);
  if (id.toLowerCase().includes("0.5b")) return 0.49;
  if (id.toLowerCase().includes("1.5b")) return 1.54;
  if (id.toLowerCase().includes("1b")) return 1.23;
  if (id.toLowerCase().includes("2b")) return 2.61;
  if (id.toLowerCase().includes("3b")) return 3.09;
  if (id.toLowerCase().includes("7b")) return 7.24;
  if (id.toLowerCase().includes("8b")) return 8.03;
  if (id.toLowerCase().includes("14b")) return 14.7;
  if (id.toLowerCase().includes("32b")) return 32.5;
  if (id.toLowerCase().includes("70b")) return 70.55;
  return 7.0;
}

function calculateClientFit(body: FitRequest): FitResponse {
  const params_b = body.params_b ?? parseParamsFromModelId(body.hf_model_id ?? "7B");
  const bytes_per = BYTES_PER_WEIGHT[body.precision] ?? 2.0;
  const weights_gb = params_b * bytes_per;
  
  const layers = params_b < 2 ? 24 : params_b < 4 ? 28 : params_b < 10 ? 32 : params_b < 20 ? 48 : params_b < 40 ? 64 : 80;
  const kv_heads = params_b < 4 ? 2 : 8;
  const head_dim = 128;
  const kv_bytes = 2;
  const kv_per_tok = (2 * layers * kv_heads * head_dim * kv_bytes * (body.batch_size || 1)) / 1e9;
  const kv_cache_gb = kv_per_tok * body.context_tokens;
  
  let overhead_gb = 2.5;
  if (body.device_vram_gb) {
    if (body.device_vram_gb <= 4) overhead_gb = 0.4;
    else if (body.device_vram_gb <= 8) overhead_gb = 0.8;
    else if (body.device_vram_gb <= 16) overhead_gb = 1.5;
  }
  
  const total_gb = weights_gb + kv_cache_gb + overhead_gb;
  let verdict: "fits" | "tight" | "does_not_fit" | null = null;
  let headroom_gb: number | null = null;
  let max_context_tokens: number | null = null;
  
  if (body.device_vram_gb) {
    headroom_gb = body.device_vram_gb - total_gb;
    verdict = headroom_gb < 0 ? "does_not_fit" : headroom_gb < 0.1 * body.device_vram_gb ? "tight" : "fits";
    const free_for_kv = body.device_vram_gb - weights_gb - overhead_gb;
    max_context_tokens = free_for_kv > 0 ? Math.floor(free_for_kv / kv_per_tok) : 0;
  }
  
  const ceiling = body.memory_bandwidth_gbps ? (body.memory_bandwidth_gbps / (weights_gb + kv_cache_gb)) * body.batch_size : null;

  return {
    model: body.hf_model_id ?? `${params_b}B Custom Model`,
    params_b: Math.round(params_b * 100) / 100,
    params_source: body.params_b ? "override" : "config",
    precision: body.precision,
    weights_gb: Math.round(weights_gb * 100) / 100,
    kv_cache_gb: Math.round(kv_cache_gb * 100) / 100,
    overhead_gb: Math.round(overhead_gb * 100) / 100,
    total_gb: Math.round(total_gb * 100) / 100,
    verdict,
    headroom_gb: headroom_gb !== null ? Math.round(headroom_gb * 100) / 100 : null,
    max_context_tokens,
    decode_tok_s_ceiling: ceiling !== null ? Math.round(ceiling * 10) / 10 : null,
    warnings: ["Calculated using client-side estimation model."],
  };
}

const FALLBACK_MODELS = [
  { name: "Qwen/Qwen2.5-0.5B-Instruct", params_b: 0.49 },
  { name: "meta-llama/Llama-3.2-1B-Instruct", params_b: 1.23 },
  { name: "Qwen/Qwen2.5-1.5B-Instruct", params_b: 1.54 },
  { name: "google/gemma-2-2b-it", params_b: 2.61 },
  { name: "Qwen/Qwen2.5-3B-Instruct", params_b: 3.09 },
  { name: "meta-llama/Llama-3.2-3B-Instruct", params_b: 3.21 },
  { name: "microsoft/Phi-3.5-mini-instruct", params_b: 3.82 },
  { name: "mistralai/Mistral-7B-Instruct-v0.3", params_b: 7.24 },
  { name: "Qwen/Qwen2.5-7B-Instruct", params_b: 7.61 },
  { name: "meta-llama/Meta-Llama-3-8B-Instruct", params_b: 8.03 },
  { name: "Qwen/Qwen2.5-14B-Instruct", params_b: 14.7 },
  { name: "Qwen/Qwen2.5-32B-Instruct", params_b: 32.5 },
  { name: "meta-llama/Meta-Llama-3-70B-Instruct", params_b: 70.55 },
];

function calculateClientAdvise(body: AdviseRequest): AdviseResponse {
  const precisions: Precision[] = ["BF16", "FP16", "INT8", "INT4"];
  const candidates: Array<{
    model: string;
    params_b: number;
    precision: string;
    verdict: "fits" | "tight";
    total_gb: number;
    headroom_gb: number;
    max_context_tokens: number;
    speed: AdviseOption["speed"];
  }> = [];

  let considered = 0;
  let too_big = 0;

  for (const m of FALLBACK_MODELS) {
    for (const prec of precisions) {
      considered++;
      const fit = calculateClientFit({
        params_b: m.params_b,
        hf_model_id: m.name,
        precision: prec,
        context_tokens: body.context_tokens,
        batch_size: body.batch_size,
        device_vram_gb: body.vram_gb,
        memory_bandwidth_gbps: body.memory_bandwidth_gbps,
      });

      if (fit.verdict === "fits" || fit.verdict === "tight") {
        const speedVal = fit.decode_tok_s_ceiling ? Math.round(fit.decode_tok_s_ceiling * 0.7) : null;
        candidates.push({
          model: m.name,
          params_b: m.params_b,
          precision: prec,
          verdict: fit.verdict,
          total_gb: fit.total_gb,
          headroom_gb: fit.headroom_gb ?? 0,
          max_context_tokens: fit.max_context_tokens ?? 0,
          speed: speedVal
            ? {
                source: "ceiling",
                tok_s: speedVal,
                low: null,
                high: null,
                runs: null,
                verified: null,
                note: "Estimated memory bandwidth roofline",
              }
            : null,
        });
      } else {
        too_big++;
      }
    }
  }

  if (body.goal === "fastest") {
    candidates.sort((a, b) => (b.speed?.tok_s ?? 0) - (a.speed?.tok_s ?? 0) || b.params_b - a.params_b);
  } else if (body.goal === "longest_context") {
    candidates.sort((a, b) => b.max_context_tokens - a.max_context_tokens || b.params_b - a.params_b);
  } else {
    candidates.sort((a, b) => b.params_b - a.params_b || b.headroom_gb - a.headroom_gb);
  }

  const options: AdviseOption[] = candidates.slice(0, body.limit ?? 10).map((c, i) => ({
    rank: i + 1,
    ...c,
  }));

  return {
    options,
    considered,
    too_big,
    below_speed_target: 0,
    measured_count: 0,
    notes: [`Evaluated ${considered} model/precision combinations for ${body.vram_gb} GB VRAM.`],
  };
}

export const hubApi = {
  fit: async (body: FitRequest) => {
    try {
      return await call<FitResponse>("/fit", { method: "POST", body: JSON.stringify(body) });
    } catch {
      return calculateClientFit(body);
    }
  },
  advise: async (body: AdviseRequest) => {
    try {
      return await call<AdviseResponse>("/advise", { method: "POST", body: JSON.stringify(body) });
    } catch {
      return calculateClientAdvise(body);
    }
  },
  stats: () => call<HubStats>("/hub/stats"),
  leaderboard: (params: { model?: string; context: number; batch?: number }) => {
    const query = new URLSearchParams({ context: String(params.context), batch: String(params.batch ?? 1) });
    if (params.model) query.set("model", params.model);
    return call<LeaderboardRow[]>(`/leaderboard?${query}`);
  },
  localGpu: () => call<LocalGpu>("/hardware/local"),
};
