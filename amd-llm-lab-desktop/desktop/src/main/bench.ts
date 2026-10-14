import type { BenchResult, Calibration, ChatMessage, InstalledModel, MachineProfile, SpeedRange } from "../shared/types";
import { makeCalibration, median, placementKey, streamGiBFor, toQuantId } from "../core/calib";
import { findModel, matchInstalledName } from "../core/catalog";
import type { Runtime } from "./runtime/types";

const WARM: ChatMessage[] = [{ role: "user", content: "Say hi." }];
// Fixed prompts so results are comparable between runs and between people.
const DECODE_PROMPT: ChatMessage[] = [{ role: "user", content: "Write a detailed, step by step explanation of how a CPU executes an instruction, from fetch to write-back. Keep going until you run out of space." }];
const PREFILL_PROMPT: ChatMessage[] = [{ role: "user", content: ("The quick brown fox jumps over the lazy dog. ".repeat(60)) + "\nSummarise the text above in one word." }];

export interface BenchOptions { ctx: number; runs?: number; maxTokens?: number; predicted?: SpeedRange | null }
export interface BenchOutcome { result: BenchResult; calibration: Partial<Calibration> }

export async function runBenchmark(
  rt: Runtime, model: InstalledModel, machine: MachineProfile, opts: BenchOptions,
  progress: (step: string, frac: number) => void, signal: AbortSignal,
): Promise<BenchOutcome> {
  const runs = opts.runs ?? 3, maxTokens = opts.maxTokens ?? 128;
  const o = { ctx: opts.ctx, maxTokens, temperature: 0 };
  const notes: string[] = [];
  progress("Loading the model", 0.05);
  const warm = await rt.chat(model.name, WARM, { ...o, maxTokens: 4 }, () => undefined, signal);
  progress("Measuring prompt speed", 0.2);
  const pre = await rt.chat(model.name, PREFILL_PROMPT, { ...o, maxTokens: 1 }, () => undefined, signal).catch(() => null);
  const decodeRuns: number[] = [];
  for (let i = 0; i < runs; i++) {
    progress(`Measuring generation speed (${i + 1}/${runs})`, 0.3 + (0.65 * i) / runs);
    const s = await rt.chat(model.name, DECODE_PROMPT, o, () => undefined, signal);
    if (s.decodeTokS && s.tokens >= 24) decodeRuns.push(s.decodeTokS);
    else notes.push("A run ended too early to measure and was discarded.");
  }
  const placement = (await rt.placement(model.name)) ?? { gpuFraction: null, sizeGiB: model.sizeGiB, vramGiB: null };
  const decode = median(decodeRuns);
  const spec = model.catalogId ? findModel(model.catalogId) : matchInstalledName(model.name);
  const quant = toQuantId(model.quant);
  const stream = streamGiBFor(spec, model, quant, opts.ctx);

  if (placement.gpuFraction !== null && placement.gpuFraction > 0.02 && placement.gpuFraction < 0.95) notes.push(`Only ${Math.round(placement.gpuFraction * 100)}% of the model is on the GPU, so this run is a mixed result and is not used to calibrate predictions.`);
  if (machine.power.onBattery) notes.push("Measured on battery power; speeds are usually lower than when plugged in.");
  if (decodeRuns.length > 1) { const lo = Math.min(...decodeRuns), hi = Math.max(...decodeRuns); if (hi / lo > 1.25) notes.push("Runs varied by more than 25%, which suggests thermal throttling or background load."); }
  if (!decode) notes.push("No run produced enough tokens to measure speed.");

  const gpuName = machine.gpus[0]?.name;
  const result: BenchResult = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(),
    runtimeId: rt.id, runtimeName: rt.name, model: model.name, catalogId: spec?.id ?? null, quant: model.quant, paramsB: model.paramsB ?? spec?.paramsB ?? null,
    ctx: opts.ctx, decodeTokS: decode, decodeRuns, prefillTokS: pre?.prefillTokS ?? null, ttftS: pre?.ttftS ?? null, loadS: warm.loadS,
    placement, onBattery: machine.power.onBattery, predicted: opts.predicted ?? null,
    machineSummary: `${machine.cpu.name}${gpuName ? " + " + gpuName : ""}, ${machine.ram.totalGiB.toFixed(0)} GiB`, notes,
  };
  const calibration: Partial<Calibration> = {};
  const key = placementKey(machine, placement);
  if (decode && stream && key) calibration[key] = makeCalibration(decode, stream, { model: model.name, quant, ctx: opts.ctx, runtime: rt.name, at: result.at });
  progress("Done", 1);
  return { result, calibration };
}
