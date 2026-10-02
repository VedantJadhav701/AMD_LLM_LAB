export type ModelInfo = {
  model: string;
  parameters_b: number;
  precisions: string[];
  quantizations: string[];
  backends: string[];
  context_lengths: number[];
};

export type HardwareInfo = {
  gpu: string;
  vram_gb: number;
  architecture: string;
  rocm: string;
  pytorch: string;
};

export type LocalHardwareInfo = {
  host_scope: "fastapi_host";
  platform: string;
  system: string;
  release: string;
  cpu: { name: string; logical_cores: number; physical_cores: number | null };
  memory: { total_gb: number | null; available_gb: number | null };
  gpu: { available: boolean; name: string | null; vram_gb: number | null; vram_free_gb: number | null; vendor: string | null; detection_method: string };
};

export type BenchmarkRecord = {
  model: string;
  parameters_b: number;
  precision: string;
  quantization: string;
  context_tokens: number;
  output_tokens: number;
  latency_s: number | null;
  generation_tok_s: number | null;
  peak_vram_gb: number;
  memory_per_billion_params_gb: number | null;
  tokens_per_gb: number | null;
  vram_utilization_pct: number | null;
  hardware: string;
  gpu: string;
  gpu_vram_gb: number;
  backend: string;
  source_file: string;
  source_type: "measured";
  source_id: string;
  confidence: number;
  data_coverage: number;
  source_count: number;
};

export type PredictionRequest = {
  parameters_b: number;
  context_tokens: number;
  gpu_vram_gb?: number;
  precision: string;
  quantization: string;
  backend: string;
};

export type PredictionResponse = {
  prediction: { vram_gb: number; throughput_tok_s: number };
  uncertainty: {
    vram_mae_gb: number;
    throughput_mae_tok_s: number;
    vram_guidance: string;
    throughput_guidance: string;
    extrapolation_warning: string | null;
  };
  model_version: string;
  prediction_type: "measured" | "estimated" | "interpolated";
  training_dataset: string;
  source_type: "measured" | "estimated" | "interpolated";
  source_id: string;
  confidence: number;
  data_coverage: number;
  source_count: number;
};

export type RecommendationConfiguration = {
  precision: string;
  quantization: string;
  backend: string;
};

export type RecommendationRow = RecommendationConfiguration & {
  rank: number;
  model: string;
  parameters_b: number;
  predicted_vram_gb: number;
  predicted_generation_tok_s: number;
  fits_vram: boolean;
  meets_throughput: boolean;
  score: number;
  vram_mae_gb: number;
  throughput_mae_tok_s: number;
  source_type: "measured" | "estimated" | "interpolated";
  source_id: string;
  confidence: number;
  data_coverage: number;
  source_count: number;
};

export type RecommendationResponse = {
  feasible_configurations: RecommendationRow[];
  total_candidates_evaluated: number;
  feasible_count: number;
  objective: string;
  constraints: Record<string, number>;
  model_version: string;
  warning: string;
  prediction_type: "estimated";
  training_dataset: string;
  candidate_configurations: RecommendationRow[];
};

export type ApiConfiguration = RecommendationConfiguration;
