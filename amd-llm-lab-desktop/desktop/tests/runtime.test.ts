import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS helper
import { startMockOllama } from "./helpers/mock-ollama.mjs";
import { OllamaRuntime } from "../src/main/runtime/ollama";
import { assertLoopback } from "../src/main/runtime/types";
import { runBenchmark } from "../src/main/bench";
import { gpu, machine } from "./fixtures";
import type { Server } from "node:http";

let server: Server; const PORT = 18434;
beforeAll(async () => { server = await startMockOllama(PORT, { tokS: 200 }); });
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("runtime safety", () => {
  it("only allows localhost", () => {
    expect(() => assertLoopback("http://127.0.0.1:11434")).not.toThrow();
    expect(() => assertLoopback("http://evil.example.com")).toThrow(/localhost/);
    expect(() => assertLoopback("file:///etc/passwd")).toThrow();
  });
});

describe("ollama adapter against the mock", () => {
  const rt = () => new OllamaRuntime(`http://127.0.0.1:${PORT}`);
  it("reports status and lists models with catalog ids", async () => {
    expect((await rt().status()).online).toBe(true);
    const ms = await rt().list();
    expect(ms.map((m) => m.catalogId)).toEqual(["llama-3.1-8b", "qwen2.5-3b"]);
    expect(ms[0].paramsB).toBe(8);
  });
  it("creates a model from a local GGUF path", async () => {
    const r = rt();
    await r.createFromGguf("imported-gemma", "C:/path/gemma.gguf");
    const ms = await r.list();
    expect(ms.some((m) => m.name === "imported-gemma")).toBe(true);
  });
  it("reports offline cleanly", async () => { expect((await new OllamaRuntime("http://127.0.0.1:1").status()).online).toBe(false); });
  it("streams tokens and returns the runtime's own timings", async () => {
    let text = "";
    const s = await rt().chat("llama3.1:8b", [{ role: "user", content: "hi" }], { ctx: 2048, maxTokens: 30 }, (t) => (text += t));
    expect(text.length).toBeGreaterThan(10);
    expect(s.tokens).toBe(30);
    expect(s.decodeTokS).toBeCloseTo(200, 0);
  });
  it("benchmarks, reads placement and produces a calibration for the right pool", async () => {
    const r = rt(); const [model] = await r.list();
    const m = machine({ gpus: [gpu({ name: "NVIDIA RTX 4060 Laptop GPU", vendor: "nvidia", kind: "discrete", accel: "yes", dedicatedGiB: 8 })] });
    const steps: string[] = [];
    const out = await runBenchmark(r, model, m, { ctx: 4096, runs: 2 }, (s) => steps.push(s), new AbortController().signal);
    expect(out.result.decodeTokS).toBeCloseTo(200, 0);
    expect(out.result.placement.gpuFraction).toBe(1);
    expect(out.calibration.gpu?.measuredTokS).toBeCloseTo(200, 0);
    expect(out.calibration.cpu).toBeUndefined();
    expect(steps.at(-1)).toBe("Done");
  });
  it("can be cancelled", async () => {
    const r = rt(); const [model] = await r.list(); const ctl = new AbortController();
    const p = runBenchmark(r, model, machine(), { ctx: 4096 }, () => ctl.abort(), ctl.signal);
    await expect(p).rejects.toThrow();
  });
});
