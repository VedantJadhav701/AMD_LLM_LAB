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
      /* keep the generic message */
    }
    throw new ApiError(message);
  }
  return response.json() as Promise<T>;
}

export const hubApi = {
  fit: (body: FitRequest) => call<FitResponse>("/fit", { method: "POST", body: JSON.stringify(body) }),
  advise: (body: AdviseRequest) => call<AdviseResponse>("/advise", { method: "POST", body: JSON.stringify(body) }),
  stats: () => call<HubStats>("/hub/stats"),
  leaderboard: (params: { model?: string; context: number; batch?: number }) => {
    const query = new URLSearchParams({ context: String(params.context), batch: String(params.batch ?? 1) });
    if (params.model) query.set("model", params.model);
    return call<LeaderboardRow[]>(`/leaderboard?${query}`);
  },
  localGpu: () => call<LocalGpu>("/hardware/local"),
};
