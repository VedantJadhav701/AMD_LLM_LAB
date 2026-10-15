import type {
  Calibration, Flag, Goal, GpuInfo, Level, MachineProfile, MemoryBar, ModelSpec, Plan, QuantId,
  Recommendation, SpeedBasis, SpeedRange, Verdict,
} from "../shared/types";
import { CPU_EFFICIENCY, CPU_GUESS_GBPS, gpuEfficiency, guessDiscreteBandwidth } from "./hwdb";
import { fmtCtx, fmtGiB, fmtRange } from "./format";
import { GIB_TO_GB, QUANTS, kvGiB, overheadGiB, quantsFor, streamedWeightsGiB, weightsGiB } from "./quant";

export interface EvalOptions {
  ctx: number;
  /** Bytes per KV element: 2 for f16, about 1.06 for q8_0. */
  kvBytes?: number;
  calibration?: Calibration;
}

/** Tokens per second that make a model feel a certain way in chat. Reading speed is roughly 5 to 8. */
export const LEVELS: Array<{ level: Level; min: number; label: string; meaning: string }> = [
  { level: "great", min: 25, label: "Runs great", meaning: "Faster than you can read. Feels instant." },
  { level: "good", min: 12, label: "Runs well", meaning: "Comfortably faster than reading speed." },
  { level: "usable", min: 6, label: "Usable", meaning: "About reading speed. Fine for chat, slow for long answers." },
  { level: "slow", min: 2.5, label: "Slow", meaning: "You will wait for every answer." },
  { level: "crawl", min: 0, label: "Too slow", meaning: "Technically runs, but not practical." },
];
const LEVEL_ORDER: Level[] = ["wont_run", "crawl", "slow", "usable", "good", "great"];
export const levelLabel = (l: Level) => (l === "wont_run" ? "Won't run" : LEVELS.find((x) => x.level === l)!.label);
export const levelRank = (l: Level) => LEVEL_ORDER.indexOf(l);

export function levelForSpeed(tokS: number): Level {
  for (const l of LEVELS) if (tokS >= l.min) return l.level;
  return "crawl";
}

interface Bw { lo: number; hi: number; basis: SpeedBasis }

interface GpuPool {
  info: GpuInfo;
  kind: "discrete" | "unified" | "integrated";
  nowGiB: number;
  freedGiB: number;
  label: string;
  bw: Bw;
}
interface Pools {
  gpu: GpuPool | null;
  ramNowGiB: number;
  ramFreedGiB: number;
  cpuBw: Bw;
  unifiedNote: string | null;
}

const OS_RESERVE: Record<string, number> = { win32: 5, darwin: 4, linux: 2.5 };
const APP_RESERVE = 0.8;
const WEAKEST: SpeedBasis[] = ["guess", "spec", "measured-memory", "calibrated"];
const weakest = (...b: SpeedBasis[]) => b.reduce((a, c) => (WEAKEST.indexOf(c) < WEAKEST.indexOf(a) ? c : a));

export function applyOverrides(m: MachineProfile): MachineProfile {
  const o = m.overrides ?? {};
  const out: MachineProfile = { ...m, gpus: m.gpus.map((g) => ({ ...g })), ram: { ...m.ram } };
  if (o.ramAvailableGiB != null) out.ram.availableGiB = Math.min(o.ramAvailableGiB, out.ram.totalGiB);
  if (o.gpuIndex != null && out.gpus[o.gpuIndex]) {
    const [g] = out.gpus.splice(o.gpuIndex, 1);
    out.gpus.unshift(g);
  }
  // No GPU was detected but the user says they have one: believe them instead of silently ignoring the setting.
  if (!out.gpus.length && o.vramGiB != null && !o.forceCpuOnly) {
    out.gpus.push({ id: "manual", vendor: "other", name: "GPU (entered manually)", kind: out.unified ? "apple" : "discrete", dedicatedGiB: o.vramGiB, freeGiB: o.vramGiB, sharedGiB: null,
      bandwidthGBps: o.bandwidthGBps ?? guessDiscreteBandwidth(o.vramGiB), bandwidthSource: o.bandwidthGBps != null ? "spec" : "guess", accel: "yes" });
  }
  const g0 = out.gpus[0];
  if (g0 && o.vramGiB != null) {
    g0.dedicatedGiB = o.vramGiB;
    g0.freeGiB = o.vramGiB;
  }
  if (g0 && o.bandwidthGBps != null) {
    g0.bandwidthGBps = o.bandwidthGBps;
    g0.bandwidthSource = "spec";
  }
  return out;
}

function calBw(effGBps: number, streamGiB: number, calStreamGiB: number): Bw {
  const ratio = Math.max(streamGiB / calStreamGiB, calStreamGiB / streamGiB);
  const spread = ratio > 3 ? 0.3 : 0.15;
  return { lo: effGBps * (1 - spread), hi: effGBps * (1 + spread), basis: "calibrated" };
}

function buildPools(raw: MachineProfile, calibration: Calibration | undefined, streamGiB: number): Pools {
  const m = applyOverrides(raw);
  const reserve = OS_RESERVE[m.platform] ?? 3;
  const ramFreedGiB = Math.max(0, m.ram.totalGiB - reserve - APP_RESERVE);
  const ramNowGiB = Math.max(0, Math.min(m.ram.availableGiB - APP_RESERVE, ramFreedGiB));

  // CPU bandwidth: calibrated > measured memory throughput > guess
  let cpuBw: Bw;
  if (calibration?.cpu) cpuBw = calBw(calibration.cpu.effGBps, streamGiB, calibration.cpu.streamGiB);
  else if (m.memProbe) cpuBw = { lo: m.memProbe.readGBps * CPU_EFFICIENCY[0], hi: m.memProbe.readGBps * CPU_EFFICIENCY[1], basis: "measured-memory" };
  else cpuBw = { lo: CPU_GUESS_GBPS * CPU_EFFICIENCY[0] * 0.6, hi: CPU_GUESS_GBPS * CPU_EFFICIENCY[1] * 1.5, basis: "guess" };

  let gpu: GpuPool | null = null;
  const g = m.overrides?.forceCpuOnly ? undefined : m.gpus[0];
  if (g && g.accel !== "no") {
    const dedicated = g.dedicatedGiB;
    if (g.kind === "apple") {
      const wired = m.wiredLimitGiB && m.wiredLimitGiB > 0 ? m.wiredLimitGiB : m.ram.totalGiB * (m.ram.totalGiB <= 36 ? 0.667 : 0.75);
      const freedGiB = Math.max(0, Math.min(wired, m.ram.totalGiB - 3.5));
      const nowGiB = Math.max(0, Math.min(freedGiB, m.ram.availableGiB - 0.5));
      const bw = g.bandwidthGBps;
      let gbw: Bw;
      if (calibration?.gpu) gbw = calBw(calibration.gpu.effGBps, streamGiB, calibration.gpu.streamGiB);
      else if (bw) {
        const [lo, hi] = gpuEfficiency("apple", "apple", bw);
        gbw = { lo: bw * lo, hi: bw * hi, basis: "spec" };
      } else gbw = { lo: 20, hi: 60, basis: "guess" };
      gpu = { info: g, kind: "unified", nowGiB, freedGiB, label: `GPU (${fmtGiB(freedGiB)} of unified memory)`, bw: gbw };
    } else if (g.kind === "discrete" && dedicated != null && dedicated > 0) {
      const gpuReserve = m.platform === "win32" ? 0.8 : 0.4;
      const freedGiB = Math.max(0, dedicated - gpuReserve);
      const nowGiB = Math.max(0, Math.min(freedGiB, (g.freeGiB ?? dedicated) - gpuReserve));
      let gbw: Bw;
      if (calibration?.gpu) gbw = calBw(calibration.gpu.effGBps, streamGiB, calibration.gpu.streamGiB);
      else {
        const known = g.bandwidthGBps;
        const bw = known ?? guessDiscreteBandwidth(dedicated);
        const [lo, hi] = gpuEfficiency(g.vendor, "discrete", bw);
        const widen = known ? 1 : 0.6;
        gbw = { lo: bw * lo * widen, hi: bw * hi * (known ? 1 : 1.5), basis: known ? "spec" : "guess" };
      }
      gpu = { info: g, kind: "discrete", nowGiB, freedGiB, label: `GPU (${fmtGiB(dedicated)} VRAM)`, bw: gbw };
    } else if (g.kind === "integrated" && (g.accel === "yes" || g.accel === "likely")) {
      const pool = Math.min((dedicated ?? 0) + (g.sharedGiB ?? m.ram.totalGiB * 0.5), m.ram.totalGiB - reserve);
      const freedGiB = Math.max(0, pool);
      const nowGiB = Math.max(0, Math.min(freedGiB, m.ram.availableGiB - APP_RESERVE));
      gpu = { info: g, kind: "integrated", nowGiB, freedGiB, label: "Integrated GPU (shared memory)", bw: cpuBw };
    }
  }
  return { gpu, ramNowGiB, ramFreedGiB, cpuBw, unifiedNote: null };
}

function speedRange(streamGiB: number, gpuFraction: number, gpuBw: Bw | null, cpuBw: Bw, penalty = 1): { speed: SpeedRange; basis: SpeedBasis } {
  const gpuPart = streamGiB * gpuFraction * GIB_TO_GB;
  const cpuPart = streamGiB * (1 - gpuFraction) * GIB_TO_GB;
  const time = (pick: "lo" | "hi") => (gpuPart > 0 && gpuBw ? gpuPart / gpuBw[pick] : 0) + (cpuPart > 0 ? cpuPart / cpuBw[pick] : 0);
  const lo = penalty / time("lo");
  const hi = penalty / time("hi");
  const bases: SpeedBasis[] = [];
  if (gpuPart > 0 && gpuBw) bases.push(gpuBw.basis);
  if (cpuPart > 0) bases.push(cpuBw.basis);
  return { speed: { lo, mid: Math.sqrt(lo * hi), hi }, basis: weakest(...bases) };
}

interface Need { weights: number; kv: number; overhead: number; total: number; stream: number }

function computePlans(pools: Pools, need: Need): { now: Plan[]; freed: Plan[]; all: Plan[] } {
  const plans: Plan[] = [];
  const mk = (kind: Plan["kind"], where: string, frac: number, fitsNow: boolean, fitsFreed: boolean, reason?: string): { plan: Plan; fitsNow: boolean; fitsFreed: boolean } => {
    const gpuBw = pools.gpu?.bw ?? null;
    const penalty = kind === "split" ? 0.85 : 1;
    const feasible = fitsNow || fitsFreed;
    const sp = feasible ? speedRange(need.stream, frac, gpuBw, pools.cpuBw, penalty) : null;
    return {
      plan: {
        kind, where, feasible: fitsNow, infeasibleReason: feasible ? undefined : reason,
        gpuFraction: frac, gpuGiB: need.total * frac, cpuGiB: need.total * (1 - frac),
        speed: sp?.speed ?? null, basis: sp?.basis ?? "guess",
      },
      fitsNow, fitsFreed,
    };
  };
  const results: Array<ReturnType<typeof mk>> = [];
  const gpu = pools.gpu;
  if (gpu) {
    results.push(mk("gpu", gpu.label, 1, need.total <= gpu.nowGiB, need.total <= gpu.freedGiB,
      `Needs ${fmtGiB(need.total)}, the GPU can give ${fmtGiB(gpu.freedGiB)}.`));
    if (gpu.kind === "discrete" && need.total > gpu.freedGiB) {
      const perGpu = (g: number) => Math.max(0, Math.min(1, (g - need.overhead) / (need.weights + need.kv)));
      const fNow = perGpu(gpu.nowGiB), fFreed = perGpu(gpu.freedGiB);
      const useF = fNow >= 0.15 ? fNow : fFreed;
      if (useF >= 0.15) {
        const cpuNeed = (1 - useF) * need.total;
        results.push(mk("split", `GPU + system memory (${Math.round(useF * 100)}% on GPU)`, useF,
          fNow >= useF && cpuNeed <= pools.ramNowGiB, cpuNeed <= pools.ramFreedGiB,
          `Needs ${fmtGiB(cpuNeed)} of system memory for the part that does not fit on the GPU.`));
      }
    }
    if (gpu.kind === "unified" && need.total > gpu.freedGiB && need.total <= pools.ramFreedGiB) {
      // Past the macOS GPU limit: layers spill to the CPU and speed drops sharply.
      const f = gpu.freedGiB / need.total;
      results.push(mk("split", "GPU + CPU (past the macOS GPU memory limit)", f, need.total <= pools.ramNowGiB, true,
        "Not enough memory."));
    }
  }
  results.push(mk("cpu", "CPU and system memory", 0, need.total <= pools.ramNowGiB, need.total <= pools.ramFreedGiB,
    `Needs ${fmtGiB(need.total)}, you can give ${fmtGiB(pools.ramFreedGiB)} of ${fmtGiB(pools.ramFreedGiB + (OS_RESERVE.win32 + APP_RESERVE))} installed.`));
  for (const r of results) plans.push(r.plan);
  const mid = (p: Plan) => p.speed?.mid ?? 0;
  const now = results.filter((r) => r.fitsNow).map((r) => r.plan).sort((a, b) => mid(b) - mid(a));
  const freed = results.filter((r) => !r.fitsNow && r.fitsFreed).map((r) => r.plan).sort((a, b) => mid(b) - mid(a));
  return { now, freed, all: plans };
}

function needFor(model: ModelSpec, quant: QuantId, ctx: number, kvBytes: number): Need {
  const weights = weightsGiB(model, quant);
  const kv = kvGiB(model, ctx, kvBytes);
  const overhead = overheadGiB(ctx);
  return { weights, kv, overhead, total: weights + kv + overhead, stream: streamedWeightsGiB(model, quant) + kv };
}

/** Largest context from the usual ladder that still fits for the given quant. */
function maxContextFor(machine: MachineProfile, model: ModelSpec, quant: QuantId, kvBytes: number, calibration?: Calibration): number | null {
  const ladder = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072].filter((c) => c <= model.maxContext);
  if (!ladder.includes(model.maxContext)) ladder.push(model.maxContext);
  let best: number | null = null;
  for (const ctx of ladder) {
    const need = needFor(model, quant, ctx, kvBytes);
    const pools = buildPools(machine, calibration, need.stream);
    const { now, freed } = computePlans(pools, need);
    if (now.length || freed.length) best = ctx;
    else break;
  }
  return best;
}

export function evaluate(machine: MachineProfile, model: ModelSpec, quant: QuantId, opts: EvalOptions): Verdict {
  const kvBytes = opts.kvBytes ?? 2;
  const m = applyOverrides(machine);
  const need = needFor(model, quant, opts.ctx, kvBytes);
  const pools = buildPools(machine, opts.calibration, need.stream);
  const { now, freed, all } = computePlans(pools, need);
  const chosen = now[0] ?? freed[0] ?? null;
  const fitsNow = now.length > 0;
  const fitsIfFreed = !fitsNow && freed.length > 0;
  const cpuPlan = all.find((p) => p.kind === "cpu") ?? null;
  const floor = cpuPlan && (cpuPlan.feasible || cpuPlan.speed) ? cpuPlan : null;

  const flags: Flag[] = [];
  const fileGiB = need.weights;
  let level: Level;
  let score = 0;
  if (!chosen || !chosen.speed) {
    level = "wont_run";
  } else {
    score = chosen.speed.mid;
    level = levelForSpeed(score);
    if (fitsIfFreed && levelRank(level) > levelRank("usable")) level = "usable";
  }

  // ---- bars: what is used against what is available
  const bars: MemoryBar[] = [];
  const kind = chosen?.kind ?? (pools.gpu ? "gpu" : "cpu");
  if (pools.gpu && (kind === "gpu" || kind === "split")) {
    bars.push({ label: pools.gpu.kind === "unified" ? "Unified memory (GPU share)" : pools.gpu.kind === "integrated" ? "Shared GPU memory" : "GPU memory", usedGiB: chosen ? chosen.gpuGiB : need.total, capacityGiB: pools.gpu.nowGiB, freedCapacityGiB: pools.gpu.freedGiB });
    if (kind === "split" && chosen) bars.push({ label: "System memory", usedGiB: chosen.cpuGiB, capacityGiB: pools.ramNowGiB, freedCapacityGiB: pools.ramFreedGiB });
  } else {
    bars.push({ label: "System memory", usedGiB: need.total, capacityGiB: pools.ramNowGiB, freedCapacityGiB: pools.ramFreedGiB });
  }

  // ---- flags
  const biggestPool = Math.max(pools.gpu?.freedGiB ?? 0, pools.ramFreedGiB);
  if (!chosen) {
    flags.push({ severity: "bad", code: "memory", text: `Needs ${fmtGiB(need.total)} in total. The most this laptop can give is ${fmtGiB(biggestPool)}.` });
  } else if (fitsIfFreed) {
    const have = kind === "cpu" || kind === "split" ? pools.ramNowGiB : pools.gpu?.nowGiB ?? 0;
    flags.push({ severity: "warn", code: "close-apps", text: `Fits only if you close other apps first. It needs ${fmtGiB(need.total)} and about ${fmtGiB(have)} is free right now.` });
  } else {
    const pool = bars[0];
    if (pool && need.total > 0.9 * pool.capacityGiB && bars.length === 1) flags.push({ severity: "warn", code: "tight", text: "Memory will be very tight. Close other apps before loading it." });
  }
  if (chosen?.kind === "cpu" && need.total > 0.7 * m.ram.totalGiB) flags.push({ severity: "warn", code: "swap", text: "This uses most of your RAM. If Windows or macOS starts swapping to disk, speed collapses." });
  if (chosen?.kind === "split") flags.push({ severity: "info", code: "split", text: "Part of the model runs on the CPU, which slows everything down. A smaller model or a lower quant that fits entirely on the GPU is usually faster." });
  if (m.platform === "darwin" && chosen?.kind === "split" && pools.gpu?.kind === "unified") {
    const want = Math.ceil((need.total + 1) * 1024);
    flags.push({ severity: "info", code: "wired-limit", text: `macOS caps GPU memory by default. On macOS 14 and later you can raise it with: sudo sysctl iogpu.wired_limit_mb=${want} (resets on reboot).` });
  }
  if (opts.ctx > model.maxContext) flags.push({ severity: "bad", code: "ctx-limit", text: `${model.name} supports up to ${fmtCtx(model.maxContext)} tokens of context.` });
  if (m.power.onBattery && chosen) flags.push({ severity: "info", code: "battery", text: "You are on battery. Laptops usually slow down 20 to 50 percent unplugged." });
  if (m.rosetta) flags.push({ severity: "warn", code: "rosetta", text: "This app is running under Rosetta, which hides the real chip. Install the Apple Silicon build for accurate results." });
  if (m.gpus[0] && m.gpus[0].accel === "maybe" && !m.overrides?.forceCpuOnly) {
    flags.push({ severity: "info", code: "gpu-maybe", text: `Whether your runtime can use the ${m.gpus[0].name} varies. Speeds shown assume your system memory speed, which is a safe estimate. Run the quick test to see what you really get.` });
  }
  if (pools.gpu?.kind === "discrete" && pools.gpu.info.bandwidthSource !== "spec") flags.push({ severity: "info", code: "gpu-unknown", text: "This GPU is not in the spec table, so its speed is a rough guess. Run the quick test to measure it." });
  if (chosen?.basis === "guess" && !(pools.gpu?.info.bandwidthSource !== "spec" && kind === "gpu")) flags.push({ severity: "info", code: "no-probe", text: "Memory speed has not been measured yet. Use Measure memory speed on the Machine page to tighten this estimate." });
  if (model.activeParamsB) flags.push({ severity: "info", code: "moe", text: `Only about ${model.activeParamsB}B of ${model.paramsB}B parameters work on each token, so it generates like a ${Math.round(model.activeParamsB)}B model but still needs the full ${fmtGiB(fileGiB)} in memory.` });
  if (QUANTS[quant].tier === "experimental") flags.push({ severity: "bad", code: "quality", text: `${QUANTS[quant].label} is experimental (about ${QUANTS[quant].bpw} bits per weight). ${QUANTS[quant].blurb} Try it to see what is possible, not for work you rely on.` });
  else if (quant === "Q3_K_M" || quant === "Q2_K" || QUANTS[quant].tier === "large loss" || QUANTS[quant].tier === "noticeable loss") flags.push({ severity: "warn", code: "quality", text: `${QUANTS[quant].label} loses noticeable quality (${QUANTS[quant].tier}). Prefer a smaller model at Q4_K_M if one runs well.` });
  const disk = m.diskFreeGiB;
  const diskOk = disk == null ? null : disk >= fileGiB + 2;
  if (diskOk === false) flags.push({ severity: "warn", code: "disk", text: `The download is about ${fmtGiB(fileGiB)} and you have ${fmtGiB(disk!)} free.` });

  // ---- headline
  let headline: string;
  if (level === "wont_run") headline = `Won't run here. Needs ${fmtGiB(need.total)}, you can give ${fmtGiB(biggestPool)}.`;
  else {
    const sp = chosen!.speed!;
    const where = chosen!.kind === "gpu" ? "your GPU" : chosen!.kind === "split" ? "GPU and CPU together" : "your CPU";
    headline = `${levelLabel(level)}. Expect about ${fmtRange(sp.lo, sp.hi)} tokens/s on ${where}.`;
  }

  const order = flags.filter((f) => f.severity === "bad").concat(flags.filter((f) => f.severity === "warn"), flags.filter((f) => f.severity === "info"));
  return {
    modelId: model.id, quant, ctx: opts.ctx, level, score, headline,
    memory: { weightsGiB: need.weights, kvGiB: need.kv, overheadGiB: need.overhead, totalGiB: need.total },
    bars, plan: chosen, floor, alternatives: all.filter((p) => p !== chosen),
    fitsNow, fitsIfFreed, fileGiB, diskOk, flags: order,
    maxContext: maxContextFor(machine, model, quant, kvBytes, opts.calibration),
  };
}

export function evaluateAllQuants(machine: MachineProfile, model: ModelSpec, opts: EvalOptions, extended = false): Verdict[] {
  return quantsFor(model, extended).map((q) => evaluate(machine, model, q, opts));
}

/** Capability proxy in billions of parameters. Mixture-of-experts uses the geometric mean of total and active. */
export function effectiveParamsB(model: ModelSpec): number {
  const p = model.paramsB - (model.extraParamsB ?? 0);
  return model.activeParamsB ? Math.sqrt(p * model.activeParamsB) : p;
}

export function recommend(machine: MachineProfile, catalog: ModelSpec[], opts: EvalOptions & { goal: Goal; limit?: number }): Recommendation[] {
  const strict = recommendPass(machine, catalog, opts, false);
  // On a very weak machine nothing reaches 'usable'. Show the best of what fits, honestly labelled, instead of an empty list.
  return strict.length ? strict : recommendPass(machine, catalog, opts, true);
}

function recommendPass(machine: MachineProfile, catalog: ModelSpec[], opts: EvalOptions & { goal: Goal; limit?: number }, lenient: boolean): Recommendation[] {
  const out: Recommendation[] = [];
  for (const model of catalog) {
    const quants = quantsFor(model);
    const verdicts = quants.map((q) => evaluate(machine, model, q, opts)).filter((v) => v.level !== "wont_run" && !v.flags.some((f) => f.code === "ctx-limit"));
    if (!verdicts.length) continue;
    let pick: Verdict | undefined;
    if (opts.goal === "speed") {
      pick = verdicts.filter((v) => QUANTS[v.quant].quality >= 0.94).sort((a, b) => b.score - a.score)[0];
    } else {
      const good = verdicts.filter((v) => levelRank(v.level) >= levelRank("good") && v.fitsNow);
      const usable = verdicts.filter((v) => levelRank(v.level) >= levelRank("usable") && v.fitsNow);
      const anyFit = verdicts.filter((v) => v.fitsNow);
      const pool = good.length ? good : usable.length || !lenient ? usable : anyFit;
      pick = pool.sort((a, b) => QUANTS[b.quant].quality - QUANTS[a.quant].quality || b.score - a.score)[0];
    }
    if (!pick) continue;
    const eff = effectiveParamsB(model);
    let qualityScore = eff * QUANTS[pick.quant].quality;
    if (pick.plan?.kind === "split") qualityScore *= 0.65;
    if (levelRank(pick.level) < levelRank("good")) qualityScore *= 0.6;
    out.push({ model, verdict: pick, qualityScore });
  }
  const ranked = out.sort((a, b) => {
    if (opts.goal === "speed") return (effectiveParamsB(b.model) >= 3 ? b.verdict.score : 0) - (effectiveParamsB(a.model) >= 3 ? a.verdict.score : 0);
    if (opts.goal === "context") return (b.verdict.maxContext ?? 0) - (a.verdict.maxContext ?? 0) || b.qualityScore - a.qualityScore;
    return b.qualityScore - a.qualityScore;
  });
  return ranked.slice(0, opts.limit ?? 8);
}
