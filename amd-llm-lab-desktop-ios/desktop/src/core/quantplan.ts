import type { QuantId, Verdict } from "../shared/types";
import { QUANTS } from "./quant";

/** Highest-quality level that fits right now. `closeApps` is the best level that fits only if the user frees memory. */
export function bestFit(verdicts: Verdict[]): { best: Verdict | null; closeApps: Verdict | null; impossible: boolean; smallest: Verdict | null } {
  const byQuality = (a: Verdict, b: Verdict) => QUANTS[b.quant].quality - QUANTS[a.quant].quality;
  const now = verdicts.filter((v) => v.fitsNow && v.level !== "wont_run").sort(byQuality);
  const freed = verdicts.filter((v) => v.fitsIfFreed).sort(byQuality);
  const smallest = [...verdicts].sort((a, b) => a.fileGiB - b.fileGiB)[0] ?? null;
  return { best: now[0] ?? null, closeApps: freed[0] ?? null, impossible: now.length === 0 && freed.length === 0, smallest };
}

export type Route = "download-quant" | "quantize-from-gguf" | "convert-from-hf";
export interface PathEstimate { route: Route; downloadGiB: number; peakDiskGiB: number; minutes: [number, number] }

const GIB_PER_GB = 1 / 1.0737;
/** Rough planning numbers. The time constants are guesses to be replaced by measurements; always show as a range. */
export function estimatePath(route: Route, paramsB: number, quant: QuantId, mbps: number): PathEstimate {
  const f16 = paramsB * 2 * GIB_PER_GB;
  const out = (paramsB * QUANTS[quant].bpw) / 8 * GIB_PER_GB;
  const dl = route === "download-quant" ? out : f16;
  const disk = route === "download-quant" ? out : route === "quantize-from-gguf" ? f16 + out : f16 * 2 + out;
  const dlMin = (dl * 8192) / Math.max(1, mbps) / 60;
  const work = route === "download-quant" ? 0 : route === "quantize-from-gguf" ? paramsB * 0.4 : paramsB * 1.2;
  return { route, downloadGiB: dl, peakDiskGiB: disk, minutes: [dlMin + work * 0.5, dlMin + work * 2] };
}
