import type { CalibrationEntry, InstalledModel, MachineProfile, ModelSpec, Placement, QuantId } from "../shared/types";
import { GIB_TO_GB, QUANTS, kvGiB, streamedWeightsGiB } from "./quant";

export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

export function toQuantId(q: string | null | undefined): QuantId {
  const u = (q ?? "").toUpperCase();
  return (u in QUANTS ? u : u.startsWith("Q4") ? "Q4_K_M" : u.startsWith("Q8") ? "Q8_0" : u.startsWith("F16") || u === "BF16" ? "F16" : "Q4_K_M") as QuantId;
}

/** Bytes the runtime has to read per generated token, in GiB. */
export function streamGiBFor(model: ModelSpec | undefined, installed: InstalledModel | undefined, quant: QuantId, ctx: number): number | null {
  // A real file size beats an estimate, except for mixture-of-experts where only active experts are read.
  if (model?.activeParamsB) return streamedWeightsGiB(model, quant) + kvGiB(model, ctx);
  if (installed?.sizeGiB) return installed.sizeGiB + (model ? kvGiB(model, ctx) : 0);
  return model ? streamedWeightsGiB(model, quant) + kvGiB(model, ctx) : null;
}

/** Which memory pool did this run actually exercise? */
export function placementKey(machine: MachineProfile, p: Placement | null): "gpu" | "cpu" | null {
  if (p && p.gpuFraction !== null) {
    if (p.gpuFraction >= 0.95) return "gpu";
    if (p.gpuFraction <= 0.02) return "cpu";
    return null; // split runs mix two pools and cannot calibrate either
  }
  // The runtime does not say. A discrete or Apple GPU is the likely target; otherwise assume CPU.
  const g = machine.gpus.find((x) => x.accel === "yes" && (x.kind === "discrete" || x.kind === "apple"));
  return g ? "gpu" : "cpu";
}

export function makeCalibration(tokS: number, streamGiB: number, meta: Omit<CalibrationEntry, "effGBps" | "measuredTokS" | "streamGiB">): CalibrationEntry {
  return { effGBps: tokS * streamGiB * GIB_TO_GB, measuredTokS: tokS, streamGiB, ...meta };
}
