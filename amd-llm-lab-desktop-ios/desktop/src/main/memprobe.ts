// Estimates how fast this machine can read memory with all cores, by timing large copies in worker threads.
// This bounds CPU-only decoding speed and is the basis for CPU and integrated-GPU predictions.
import { Worker } from "node:worker_threads";
import os from "node:os";

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const n = workerData.bytes / 8;
const a = new Float64Array(n).fill(1.5);
let sink = 0;
const passes = workerData.passes;
parentPort.postMessage("ready");
parentPort.once("message", () => {
  const t0 = process.hrtime.bigint();
  for (let p = 0; p < passes; p++) { let s = 0; for (let i = 0; i < n; i += 4) s += a[i] + a[i + 1] + a[i + 2] + a[i + 3]; sink += s; }
  const dt = Number(process.hrtime.bigint() - t0) / 1e9;
  parentPort.postMessage({ bytes: workerData.bytes * passes, seconds: dt, sink });
});`;

export async function probeMemoryBandwidth(opts: { threads?: number; mbPerThread?: number; passes?: number } = {}): Promise<{ readGBps: number; threads: number; at: string } | null> {
  const cores = os.cpus().length;
  const threads = Math.max(1, Math.min(opts.threads ?? Math.floor(cores / 2), 8));
  const bytes = (opts.mbPerThread ?? 256) * 1024 * 1024; // far larger than any cache
  const passes = opts.passes ?? 3;
  const workers: Worker[] = [];
  try {
    const results = await new Promise<Array<{ bytes: number; seconds: number }>>((resolve, reject) => {
      const out: Array<{ bytes: number; seconds: number }> = [];
      let ready = 0;
      const timer = setTimeout(() => reject(new Error("memory probe timed out")), 20000);
      for (let i = 0; i < threads; i++) {
        const w = new Worker(WORKER, { eval: true, workerData: { bytes, passes } });
        workers.push(w);
        w.on("error", reject);
        w.on("message", (m) => {
          if (m === "ready") { if (++ready === threads) workers.forEach((x) => x.postMessage("go")); }
          else { out.push(m); if (out.length === threads) { clearTimeout(timer); resolve(out); } }
        });
      }
    });
    // Threads run concurrently, so aggregate bandwidth = total bytes / the slowest thread's time.
    const total = results.reduce((a, r) => a + r.bytes, 0);
    const slow = Math.max(...results.map((r) => r.seconds));
    // A scalar JS loop does not saturate DRAM on its own; treat the result as a conservative floor.
    return { readGBps: total / slow / 1e9, threads, at: new Date().toISOString() };
  } catch { return null; } finally { workers.forEach((w) => void w.terminate()); }
}
