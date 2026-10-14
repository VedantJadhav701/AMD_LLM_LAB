import { describe, expect, it } from "vitest";
import { CATALOG, findModel } from "../src/core/catalog";
import { evaluate, evaluateAllQuants, levelForSpeed, recommend } from "../src/core/decide";
import { gpuEfficiency, appleBandwidth, lookupGpuBandwidth, classifyGpuKind } from "../src/core/hwdb";
import { GIB_TO_GB, weightsGiB } from "../src/core/quant";
import { macM2, office8, rtx4060Laptop, ryzenAi, strixHalo, machine, gpu } from "./fixtures";

const llama8 = findModel("llama-3.1-8b")!;
const qwen7 = findModel("qwen2.5-7b")!;

describe("hardware spec priors reproduce published llama.cpp speeds", () => {
  // Public llama.cpp token-generation results (approximate, quoted from memory of the Apple Silicon and CUDA
  // benchmark threads). They check that the efficiency curves are not wildly off, nothing more.
  function range(vendor: "apple" | "nvidia" | "amd", kind: "apple" | "discrete", bw: number, streamGiB: number) {
    const [lo, hi] = gpuEfficiency(vendor, kind, bw);
    return [(bw * lo) / (streamGiB * GIB_TO_GB), (bw * hi) / (streamGiB * GIB_TO_GB)];
  }
  const q4_0_7b = 3.56; // Llama-2-7B Q4_0 in GiB
  it.each([
    ["M1 (68 GB/s)", "apple", "apple", 68, q4_0_7b, 14.2],
    ["M2 (100 GB/s)", "apple", "apple", 100, q4_0_7b, 21.9],
    ["M2 Max (400 GB/s)", "apple", "apple", 400, q4_0_7b, 61.9],
    ["M2 Ultra (800 GB/s)", "apple", "apple", 800, q4_0_7b, 94],
    ["RTX 4090 Llama-3-8B Q4_K_M", "nvidia", "discrete", 1008, 4.58, 127],
    ["RTX 3090 Llama-3-8B Q4_K_M", "nvidia", "discrete", 936, 4.58, 111],
    ["RTX 3050 Laptop Qwen2.5-3B Q4_K_M", "nvidia", "discrete", 192, 1.95, 78],
    ["RX 7900 XTX 7B Q4_0", "amd", "discrete", 960, q4_0_7b, 120],
  ] as const)("%s lands inside the predicted band", (_n, vendor, kind, bw, stream, observed) => {
    const [lo, hi] = range(vendor, kind, bw, stream);
    expect(observed).toBeGreaterThanOrEqual(lo);
    expect(observed).toBeLessThanOrEqual(hi);
  });
});

describe("spec lookups", () => {
  it("finds laptop and desktop variants separately", () => {
    expect(lookupGpuBandwidth("NVIDIA GeForce RTX 4060 Laptop GPU")).toBe(256);
    expect(lookupGpuBandwidth("NVIDIA GeForce RTX 4060")).toBe(272);
    expect(lookupGpuBandwidth("AMD Radeon RX 7900 XTX")).toBe(960);
    expect(lookupGpuBandwidth("AMD Radeon RX 7900 XT")).toBe(800);
    expect(lookupGpuBandwidth("AMD Radeon(TM) 8060S Graphics")).toBe(256);
    expect(lookupGpuBandwidth("Some Unknown GPU")).toBeNull();
  });
  it("knows Apple chip bandwidth including binned Max chips", () => {
    expect(appleBandwidth("Apple M2")).toBe(100);
    expect(appleBandwidth("Apple M3 Pro")).toBe(150);
    expect(appleBandwidth("Apple M4 Max", 40)).toBe(546);
    expect(appleBandwidth("Apple M4 Max", 32)).toBe(410);
    expect(appleBandwidth("Apple M3 Max", 30)).toBe(300);
    expect(appleBandwidth("Intel Core i7")).toBeNull();
  });
  it("classifies integrated versus discrete GPUs", () => {
    expect(classifyGpuKind("AMD Radeon RX 7600M XT", "amd", 8)).toBe("discrete");
    expect(classifyGpuKind("AMD Radeon(TM) 780M Graphics", "amd", 0.5)).toBe("integrated");
    expect(classifyGpuKind("AMD Radeon(TM) Graphics", "amd", 0.5)).toBe("integrated");
    expect(classifyGpuKind("Intel(R) Arc(TM) A370M Graphics", "intel", 4)).toBe("discrete");
    expect(classifyGpuKind("Intel(R) Arc(TM) Graphics", "intel", 0.1)).toBe("integrated");
    expect(classifyGpuKind("NVIDIA GeForce RTX 3050", "nvidia", 4)).toBe("discrete");
  });
});

describe("speed classes", () => {
  it("maps tokens per second to the labels shown in the app", () => {
    expect(levelForSpeed(40)).toBe("great");
    expect(levelForSpeed(15)).toBe("good");
    expect(levelForSpeed(7)).toBe("usable");
    expect(levelForSpeed(3)).toBe("slow");
    expect(levelForSpeed(0.8)).toBe("crawl");
  });
});

describe("decisions on realistic laptops", () => {
  it("MacBook Air M2 16 GB: 8B Q4 runs well on the GPU, 70B cannot run", () => {
    const m = macM2();
    const v = evaluate(m, llama8, "Q4_K_M", { ctx: 4096 });
    expect(v.fitsNow).toBe(true);
    expect(v.plan?.kind).toBe("gpu");
    expect(["good", "great"]).toContain(v.level);
    expect(v.plan!.speed!.lo).toBeGreaterThan(8);
    expect(v.plan!.speed!.hi).toBeLessThan(40);
    const big = evaluate(m, findModel("llama-3.3-70b")!, "Q4_K_M", { ctx: 4096 });
    expect(big.level).toBe("wont_run");
    expect(big.headline).toMatch(/Won't run/);
  });

  it("MacBook Air M2 16 GB: a 14B Q4 model exceeds the default GPU limit and says how to raise it", () => {
    const v = evaluate(macM2(), findModel("qwen3-14b")!, "Q6_K", { ctx: 4096 });
    expect(v.plan?.kind).not.toBe("gpu");
    const split = evaluate(macM2(), findModel("qwen2.5-14b")!, "Q4_K_M", { ctx: 4096 });
    expect(split.level === "wont_run" || split.flags.some((f) => f.code === "wired-limit" || f.code === "close-apps")).toBe(true);
  });

  it("RTX 4060 Laptop 8 GB: 7B Q4 fits entirely on the GPU and is fast; 14B splits and is slower", () => {
    const m = rtx4060Laptop();
    const small = evaluate(m, qwen7, "Q4_K_M", { ctx: 4096 });
    expect(small.plan?.kind).toBe("gpu");
    expect(small.level).toBe("great");
    const mid = evaluate(m, findModel("qwen2.5-14b")!, "Q4_K_M", { ctx: 4096 });
    expect(mid.plan?.kind).toBe("split");
    expect(mid.plan!.speed!.mid).toBeLessThan(small.plan!.speed!.mid / 2);
    expect(mid.flags.some((f) => f.code === "split")).toBe(true);
    const huge = evaluate(m, findModel("qwen2.5-32b")!, "Q4_K_M", { ctx: 4096 });
    expect(huge.floor).not.toBeNull();
    expect(huge.level).not.toBe("great");
  });

  it("long context eats memory: the same model stops fitting on the GPU", () => {
    const m = rtx4060Laptop();
    const short = evaluate(m, qwen7, "Q4_K_M", { ctx: 2048 });
    const long = evaluate(m, qwen7, "Q4_K_M", { ctx: 32768 });
    expect(short.plan?.kind).toBe("gpu");
    expect(long.plan?.kind).not.toBe("gpu");
    expect(short.maxContext!).toBeGreaterThan(2048);
    expect(long.memory.kvGiB).toBeGreaterThan(short.memory.kvGiB * 10);
  });

  it("Ryzen AI thin laptop with an integrated GPU: runs on CPU-class bandwidth and says the GPU is uncertain", () => {
    const v = evaluate(ryzenAi(), llama8, "Q4_K_M", { ctx: 4096 });
    expect(v.plan?.kind).toBe("cpu");
    expect(v.flags.some((f) => f.code === "gpu-maybe")).toBe(true);
    expect(v.plan!.basis).toBe("measured-memory");
    expect(["usable", "good"]).toContain(v.level);
  });

  it("8 GB office laptop: only small models, and it will not pretend otherwise", () => {
    const m = office8();
    expect(evaluate(m, llama8, "Q4_K_M", { ctx: 4096 }).level).toBe("wont_run");
    const tiny = evaluate(m, findModel("llama-3.2-1b")!, "Q4_K_M", { ctx: 4096 });
    expect(tiny.level).not.toBe("wont_run");
    const recs = recommend(m, CATALOG, { goal: "quality", ctx: 4096 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.model.paramsB).toBeLessThan(5);
  });

  it("closing apps can turn a 'no' into a 'yes' and the engine says so", () => {
    const m = machine({ ram: { totalGiB: 16, availableGiB: 6 }, gpus: [], memProbe: { readGBps: 60, threads: 8, at: "now" } });
    const v = evaluate(m, llama8, "Q4_K_M", { ctx: 4096 });
    expect(v.fitsNow).toBe(false);
    expect(v.fitsIfFreed).toBe(true);
    expect(v.flags.some((f) => f.code === "close-apps")).toBe(true);
    expect(v.level).not.toBe("great");
  });

  it("mixture-of-experts: fast like a small model but needs the whole file in memory", () => {
    const moe = findModel("qwen3-30b-a3b")!;
    const dense = findModel("qwen3-32b")!;
    const m = machine({ ram: { totalGiB: 32, availableGiB: 19.5 }, memProbe: { readGBps: 85, threads: 8, at: "now" } });
    const a = evaluate(m, moe, "Q4_K_M", { ctx: 4096 });
    const b = evaluate(m, dense, "Q4_K_M", { ctx: 4096 });
    expect(a.fitsNow).toBe(true);
    expect(b.fitsNow).toBe(false);
    expect(a.plan!.speed!.mid).toBeGreaterThan(8);
    expect(a.flags.some((f) => f.code === "moe")).toBe(true);
    // same memory as a dense 30B, speed of about a 3B model
    const dense30Equivalent = (moe.paramsB * 1e9 * 4.9) / 8 / 1024 ** 3;
    expect(a.memory.weightsGiB).toBeCloseTo(dense30Equivalent, 1);
  });

  it("Strix Halo with 120 GB: gpt-oss 120B is feasible", () => {
    const v = evaluate(strixHalo(), findModel("gpt-oss-120b")!, "MXFP4", { ctx: 8192 });
    expect(v.fitsNow).toBe(true);
    expect(v.level).not.toBe("wont_run");
    expect(v.plan!.speed!.mid).toBeGreaterThan(5);
  });

  it("every plan's memory adds up", () => {
    const v = evaluate(rtx4060Laptop(), qwen7, "Q8_0", { ctx: 8192 });
    const { weightsGiB: w, kvGiB: k, overheadGiB: o, totalGiB: t } = v.memory;
    expect(w + k + o).toBeCloseTo(t, 6);
    expect(w).toBeCloseTo(weightsGiB(qwen7, "Q8_0"), 6);
  });

  it("warns about battery, disk and Rosetta only when they apply", () => {
    const base = rtx4060Laptop();
    expect(evaluate(base, qwen7, "Q4_K_M", { ctx: 4096 }).flags.map((f) => f.code)).not.toContain("battery");
    const hot = { ...base, power: { onBattery: true }, diskFreeGiB: 3, rosetta: true };
    const codes = evaluate(hot, qwen7, "Q4_K_M", { ctx: 4096 }).flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["battery", "disk", "rosetta"]));
  });

  it("user overrides win: forcing CPU-only removes the GPU plan, entering VRAM enables a GPU", () => {
    const m = rtx4060Laptop();
    const cpuOnly = evaluate({ ...m, overrides: { forceCpuOnly: true } }, qwen7, "Q4_K_M", { ctx: 4096 });
    expect(cpuOnly.plan?.kind).toBe("cpu");
    const unknown = machine({ gpus: [gpu({ name: "Mystery GPU", vendor: "other", kind: "discrete", accel: "yes" })], ram: { totalGiB: 16, availableGiB: 10 } });
    expect(evaluate(unknown, qwen7, "Q4_K_M", { ctx: 4096 }).plan?.kind).toBe("cpu");
    const fixed = evaluate({ ...unknown, overrides: { vramGiB: 12, bandwidthGBps: 360 } }, qwen7, "Q4_K_M", { ctx: 4096 });
    expect(fixed.plan?.kind).toBe("gpu");
  });
});

describe("calibration from a real measurement", () => {
  it("replaces priors with the machine's own number and narrows the band", () => {
    const m = rtx4060Laptop();
    const prior = evaluate(m, qwen7, "Q4_K_M", { ctx: 4096 });
    // Suppose the quick test measured 48 tok/s streaming a ~4.9 GiB model.
    const stream = prior.memory.weightsGiB + prior.memory.kvGiB;
    const eff = 48 * stream * GIB_TO_GB;
    const cal = { gpu: { effGBps: eff, measuredTokS: 48, streamGiB: stream, model: "x", quant: "Q4_K_M", ctx: 4096, runtime: "ollama", at: "now" } };
    const after = evaluate(m, qwen7, "Q4_K_M", { ctx: 4096, calibration: cal });
    expect(after.plan!.basis).toBe("calibrated");
    expect(after.plan!.speed!.mid).toBeGreaterThan(48 * 0.95);
    expect(after.plan!.speed!.mid).toBeLessThan(48 * 1.05);
    const widthPrior = prior.plan!.speed!.hi / prior.plan!.speed!.lo;
    const widthAfter = after.plan!.speed!.hi / after.plan!.speed!.lo;
    expect(widthAfter).toBeLessThan(widthPrior);
    // A smaller model streams fewer bytes, so it is predicted faster from the same calibration.
    const small = evaluate(m, findModel("qwen2.5-3b")!, "Q4_K_M", { ctx: 4096, calibration: cal });
    expect(small.plan!.speed!.mid).toBeGreaterThan(48);
  });
});

describe("recommendations", () => {
  it("ranks bigger models that still run well above smaller ones, and respects the machine", () => {
    const recs = recommend(rtx4060Laptop(), CATALOG, { goal: "quality", ctx: 4096, limit: 6 });
    expect(recs.length).toBeGreaterThan(2);
    for (const r of recs) expect(r.verdict.level).not.toBe("wont_run");
    const scores = recs.map((r) => r.qualityScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(recs.some((r) => r.model.paramsB > 20 && !r.model.activeParamsB)).toBe(false);
  });
  it("the speed goal puts the fastest decent model first", () => {
    const recs = recommend(rtx4060Laptop(), CATALOG, { goal: "speed", ctx: 4096, limit: 5 });
    expect(recs[0].verdict.score).toBeGreaterThanOrEqual(recs[1].verdict.score);
  });
  it("evaluateAllQuants returns one verdict per quant, ordered like the quant list", () => {
    const vs = evaluateAllQuants(macM2(), qwen7, { ctx: 4096 });
    expect(vs.map((v) => v.quant)).toEqual(["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"]);
    expect(vs[0].memory.weightsGiB).toBeGreaterThan(vs[5].memory.weightsGiB);
    expect(vs[0].plan!.speed!.mid).toBeLessThan(vs[5].plan!.speed!.mid);
  });
});
