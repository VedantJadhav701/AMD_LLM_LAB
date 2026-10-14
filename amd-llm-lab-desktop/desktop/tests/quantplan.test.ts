import { describe, expect, it } from "vitest";
import { evaluateAllQuants } from "../src/core/decide";
import { EXTENDED_QUANTS, QUANTS, weightsGiB } from "../src/core/quant";
import { bestFit, estimatePath } from "../src/core/quantplan";
import { findModel } from "../src/core/catalog";
import { gpu, machine } from "./fixtures";

const laptop4gb = () => machine({
  ram: { totalGiB: 16, availableGiB: 9 },
  gpus: [gpu({ name: "NVIDIA GeForce GTX 1650", vendor: "nvidia", kind: "discrete", dedicatedGiB: 4, freeGiB: 3.6, bandwidthGBps: 128, bandwidthSource: "spec", accel: "yes" })],
});

describe("fit studio", () => {
  it("every offered level has a table entry, ordered from best to smallest", () => {
    const bpw = EXTENDED_QUANTS.map((q) => QUANTS[q].bpw);
    expect(bpw).toEqual([...bpw].sort((a, b) => b - a));
  });
  it("sizes follow the measured bits-per-weight: an 8B at IQ1_S is about 1.9 GiB", () => {
    expect(weightsGiB(findModel("llama-3.1-8b")!, "IQ1_S")).toBeCloseTo(1.9, 0);
  });
  it("12B-class model on a 4 GB GPU: Q4 does not fit on the GPU, the lowest levels do, and the lowest are flagged experimental", () => {
    const m = findModel("qwen2.5-14b")!;
    const vs = evaluateAllQuants(laptop4gb(), m, { ctx: 2048 }, true);
    expect(vs).toHaveLength(EXTENDED_QUANTS.length);
    const q4 = vs.find((v) => v.quant === "Q4_K_M")!;
    const iq1 = vs.find((v) => v.quant === "IQ1_S")!;
    expect(q4.plan?.kind).not.toBe("gpu");
    expect(iq1.fileGiB).toBeLessThan(q4.fileGiB / 2);
    expect(iq1.flags.some((f) => f.code === "quality" && f.severity === "bad")).toBe(true);
  });
  it("a 12B at IQ1_S is borderline on a 4 GB card (most layers on the GPU), IQ2_XXS clearly spills more", () => {
    const twelve = { ...findModel("qwen2.5-14b")!, id: "t12", paramsB: 12, layers: 40, kvHeads: 8, headDim: 128 };
    const vs = evaluateAllQuants(laptop4gb(), twelve, { ctx: 2048 }, true);
    const f = (q: string) => vs.find((v) => v.quant === q)!.plan!.gpuFraction;
    expect(f("IQ1_S")).toBeGreaterThan(0.6);
    expect(f("IQ2_XXS")).toBeLessThan(f("IQ1_S"));
    expect(f("Q4_K_M")).toBeLessThan(0.5);
  });
  it("bestFit picks the highest quality that fits and reports impossibility", () => {
    const vs = evaluateAllQuants(laptop4gb(), findModel("llama-3.1-8b")!, { ctx: 4096 }, true);
    const bf = bestFit(vs);
    expect(bf.best).not.toBeNull();
    for (const v of vs.filter((x) => x.fitsNow)) expect(QUANTS[bf.best!.quant].quality).toBeGreaterThanOrEqual(QUANTS[v.quant].quality);
    const tiny = machine({ ram: { totalGiB: 4, availableGiB: 1.5 } });
    expect(bestFit(evaluateAllQuants(tiny, findModel("llama-3.3-70b")!, { ctx: 4096 }, true)).impossible).toBe(true);
  });
  it("converting from Hugging Face needs far more disk than downloading a ready-made file", () => {
    const dl = estimatePath("download-quant", 12, "IQ1_S", 100), cv = estimatePath("convert-from-hf", 12, "IQ1_S", 100);
    expect(cv.peakDiskGiB).toBeGreaterThan(dl.peakDiskGiB * 10);
    expect(dl.minutes[0]).toBeLessThan(cv.minutes[0]);
  });
});

describe("manual GPU entry", () => {
  it("entering VRAM on a machine where no GPU was detected creates a GPU instead of being ignored", () => {
    const m = machine({ ram: { totalGiB: 16, availableGiB: 9 }, overrides: { vramGiB: 8, bandwidthGBps: 256 } });
    const v = evaluateAllQuants(m, findModel("llama-3.1-8b")!, { ctx: 4096 }, true).find((x) => x.quant === "Q4_K_M")!;
    expect(v.plan?.kind).toBe("gpu");
  });
});
