import { describe, expect, it } from "vitest";
import { buildHubPayload } from "../src/main/hub";
import { gpu, machine } from "./fixtures";
import type { BenchResult } from "../src/shared/types";

const res = (o: Partial<BenchResult> = {}): BenchResult => ({ id: "1", at: "", runtimeId: "r", runtimeName: "Ollama", model: "qwen2.5:7b", catalogId: "qwen2.5-7b", quant: "Q4_K_M", paramsB: 7.6, ctx: 4096, decodeTokS: 48, decodeRuns: [48], prefillTokS: 900, ttftS: 0.2, loadS: 1, placement: { gpuFraction: 1, sizeGiB: 4.7, vramGiB: 5.3 }, onBattery: false, machineSummary: "x", notes: [], ...o });
const m = machine({ gpus: [gpu({ name: "NVIDIA GeForce RTX 4060 Laptop GPU", vendor: "nvidia", kind: "discrete", dedicatedGiB: 8, bandwidthGBps: 256 })] });

describe("hub payload", () => {
  it("matches the backend schema and contains nothing personal", () => {
    const r = buildHubPayload(res(), m, "0.1.0");
    if ("error" in r) throw new Error(r.error);
    expect(r.payload.model.hf_model_id).toBe("Qwen/Qwen2.5-7B-Instruct");
    expect(r.payload.hardware.vram_gb).toBe(8);
    expect(r.payload.results.steady_vram_gb).toBeLessThanOrEqual(8);
    expect(Object.keys(r.payload).sort()).toEqual(["client_version", "hardware", "model", "notes", "outcome", "results", "run", "software"]);
    expect(JSON.stringify(r.payload)).not.toMatch(/@|hostname|user/i);
  });
  it("refuses runs that would distort rankings", () => {
    expect("error" in buildHubPayload(res({ placement: { gpuFraction: 0.5, sizeGiB: 9, vramGiB: 4 } }), m, "0.1.0")).toBe(true);
    expect("error" in buildHubPayload(res({ catalogId: null }), m, "0.1.0")).toBe(true);
    expect("error" in buildHubPayload(res(), machine(), "0.1.0")).toBe(true);
  });
});
