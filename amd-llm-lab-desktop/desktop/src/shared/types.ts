// Types shared by the engine (core), the main process and the UI.
// Sizes are in GiB (2^30 bytes) because that is what Windows, macOS and llama.cpp show.

export type Platform = "win32" | "darwin" | "linux";
export type QuantId = "F16" | "Q8_0" | "Q6_K" | "Q5_K_M" | "Q4_K_M" | "Q3_K_M" | "Q2_K" | "MXFP4";

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  /** Total parameters, billions (what has to sit in memory). */
  paramsB: number;
  /** Parameters used per token for mixture-of-experts models. */
  activeParamsB?: number;
  layers: number;
  kvHeads: number;
  headDim: number;
  maxContext: number;
  /** Local (sliding-window) attention: share of layers and window size. */
  slidingWindow?: { fraction: number; window: number };
  /** Models shipped in one format only (for example gpt-oss in MXFP4). */
  onlyQuant?: QuantId;
  /** Real file size when the format is not a plain bits-per-weight quant. */
  fixedFileGiB?: number;
  /** Vision tower or other non-text parameters included in paramsB. */
  extraParamsB?: number;
  /** Architecture numbers used to cross-check paramsB for dense models. */
  derive?: { hidden: number; heads: number; intermediate: number; vocab: number; tiedEmbeddings: boolean };
  ollama?: string;
  hf?: string;
  tags: Array<"general" | "coding" | "reasoning" | "small" | "multilingual" | "vision" | "moe">;
  /** True when sizes come from memory or approximations rather than a config file. */
  approx?: boolean;
  source?: "catalog" | "huggingface" | "manual" | "installed";
}

export type GpuVendor = "amd" | "nvidia" | "intel" | "apple" | "qualcomm" | "other";
export type GpuKind = "discrete" | "integrated" | "apple";
/** Will the usual local runtimes actually use this GPU? */
export type AccelSupport = "yes" | "likely" | "maybe" | "no";

export interface GpuInfo {
  id: string;
  vendor: GpuVendor;
  name: string;
  kind: GpuKind;
  dedicatedGiB: number | null;
  freeGiB: number | null;
  sharedGiB: number | null;
  bandwidthGBps: number | null;
  bandwidthSource: "spec" | "guess" | "unknown";
  accel: AccelSupport;
  cores?: number | null;
  driver?: string | null;
}

export interface MachineOverrides {
  gpuIndex?: number | null;
  vramGiB?: number | null;
  bandwidthGBps?: number | null;
  ramAvailableGiB?: number | null;
  forceCpuOnly?: boolean;
}

export interface MachineProfile {
  collectedAt: string;
  platform: Platform;
  arch: string;
  osVersion: string;
  deviceModel?: string | null;
  cpu: {
    name: string;
    vendor: "amd" | "intel" | "apple" | "qualcomm" | "other";
    physicalCores: number | null;
    logicalCores: number;
    npu: "ryzen-ai" | "intel-ai-boost" | "apple-neural-engine" | "snapdragon" | null;
  };
  ram: { totalGiB: number; availableGiB: number; type?: string | null; speedMTs?: number | null };
  gpus: GpuInfo[];
  unified: boolean;
  /** macOS: user-raised GPU wired-memory limit, if any. */
  wiredLimitGiB?: number | null;
  power: { onBattery: boolean | null };
  diskFreeGiB: number | null;
  rosetta?: boolean;
  memProbe?: { readGBps: number; threads: number; at: string } | null;
  notes: string[];
  overrides: MachineOverrides;
}

export interface CalibrationEntry {
  /** Effective bytes streamed per second while decoding, in GB/s (decimal). */
  effGBps: number;
  measuredTokS: number;
  streamGiB: number;
  model: string;
  quant: string;
  ctx: number;
  runtime: string;
  at: string;
}
export interface Calibration {
  gpu?: CalibrationEntry;
  cpu?: CalibrationEntry;
}

export type Level = "great" | "good" | "usable" | "slow" | "crawl" | "wont_run";
export type SpeedBasis = "calibrated" | "spec" | "measured-memory" | "guess";
export interface SpeedRange { lo: number; mid: number; hi: number }

export interface Plan {
  kind: "gpu" | "split" | "cpu";
  where: string;
  feasible: boolean;
  infeasibleReason?: string;
  gpuFraction: number;
  gpuGiB: number;
  cpuGiB: number;
  speed: SpeedRange | null;
  basis: SpeedBasis;
}

export interface Flag { severity: "info" | "warn" | "bad"; code: string; text: string }

export interface MemoryBar { label: string; usedGiB: number; capacityGiB: number; freedCapacityGiB: number }

export interface Verdict {
  modelId: string;
  quant: QuantId;
  ctx: number;
  level: Level;
  /** Geometric-mean tokens/s of the chosen plan, 0 when it will not run. */
  score: number;
  headline: string;
  memory: { weightsGiB: number; kvGiB: number; overheadGiB: number; totalGiB: number };
  bars: MemoryBar[];
  plan: Plan | null;
  /** Guaranteed fallback: everything in system RAM. */
  floor: Plan | null;
  alternatives: Plan[];
  fitsNow: boolean;
  fitsIfFreed: boolean;
  fileGiB: number;
  diskOk: boolean | null;
  flags: Flag[];
  /** Largest context (tokens) that still fits for this quant, capped at the model's maximum. */
  maxContext: number | null;
}

export type Goal = "quality" | "speed" | "context";

export interface Recommendation {
  model: ModelSpec;
  verdict: Verdict;
  /** Size-based quality proxy used for ranking. */
  qualityScore: number;
}

// ---- runtimes and benchmarking ----
export type RuntimeKind = "ollama" | "openai";
export interface RuntimeStatus {
  id: string;
  name: string;
  kind: RuntimeKind;
  baseUrl: string;
  online: boolean;
  version?: string | null;
  error?: string | null;
}
export interface InstalledModel {
  runtimeId: string;
  name: string;
  sizeGiB: number | null;
  paramsB: number | null;
  quant: string | null;
  family: string | null;
  /** From the catalog when the name is recognised. */
  catalogId?: string | null;
}
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface GenStats {
  tokens: number;
  decodeTokS: number | null;
  promptTokens: number | null;
  prefillTokS: number | null;
  ttftS: number | null;
  loadS: number | null;
  totalS: number;
}
export interface Placement { gpuFraction: number | null; sizeGiB: number | null; vramGiB: number | null }

export interface BenchResult {
  id: string;
  at: string;
  runtimeId: string;
  runtimeName: string;
  model: string;
  catalogId?: string | null;
  quant: string | null;
  paramsB: number | null;
  ctx: number;
  decodeTokS: number | null;
  decodeRuns: number[];
  prefillTokS: number | null;
  ttftS: number | null;
  loadS: number | null;
  placement: Placement;
  onBattery: boolean | null;
  predicted?: SpeedRange | null;
  machineSummary: string;
  notes: string[];
  shared?: boolean;
}

export interface Settings {
  overrides: MachineOverrides;
  defaultCtx: number;
  customRuntimeUrl: string;
  hubUrl: string;
  kvPrecision: "f16" | "q8_0";
}

export const DEFAULT_SETTINGS: Settings = {
  overrides: {},
  defaultCtx: 4096,
  customRuntimeUrl: "",
  hubUrl: "",
  kvPrecision: "f16",
};
