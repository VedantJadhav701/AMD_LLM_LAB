import type {
  ApiConfiguration,
  BenchmarkRecord,
  HardwareInfo,
  LocalHardwareInfo,
  ModelInfo,
  PredictionRequest,
  PredictionResponse,
  RecommendationResponse,
} from "@/lib/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE}. Start the FastAPI service and retry.`);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload?.error?.message ?? `API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; model_version: string; dataset_rows: number }>("/health"),
  models: () => request<ModelInfo[]>("/models"),
  hardware: () => request<HardwareInfo>("/hardware"),
  localHardware: () => request<LocalHardwareInfo>("/hardware/local"),
  metadata: () => request<{ recommender_metadata: { configurations: ApiConfiguration[] } }>("/metadata"),
  evaluation: () => request<Record<string, string | number>>("/evaluation"),
  benchmarks: (params = new URLSearchParams()) =>
    request<BenchmarkRecord[]>(`/benchmarks?${params.toString()}`),
  predict: (body: PredictionRequest) =>
    request<PredictionResponse>("/predict", { method: "POST", body: JSON.stringify(body) }),
  recommend: (body: { available_vram_gb: number; minimum_throughput_tok_s: number; context_tokens: number; objective: string }) =>
    request<RecommendationResponse>("/recommend", { method: "POST", body: JSON.stringify(body) }),
};

export function modelLabel(model: string, parameters: number) {
  const matched = model.match(/Qwen2\.5-([\w.]+?)-(?:Instruct|Base)/i);
  return matched ? `Qwen2.5 ${matched[1]} (${parameters}B)` : `${parameters}B`;
}
