# Fit Studio: run any model on any laptop by choosing its quantization

Plan for the coding agent. Applies to `desktop/` (Electron 44, React 19, TypeScript, vitest). Read `README.md`, `src/core/decide.ts`, `src/core/quant.ts`, `src/main/ipc.ts` first.

## 1. The idea in one paragraph

A user picks a model (say a 12B) on a laptop with 4 GB VRAM. Today the app says "won't run". Fit Studio instead says: "At Q4_K_M it needs 7.8 GB. At IQ1_S it needs about 3 GB and will fit, but quality will be poor." The user picks a quantization level down to ~1.5-2 bits, and the app gets that file onto the disk (downloads a ready-made one, or converts it locally), loads it, and runs it. Every model becomes testable. The honest part: very low bits are experimental, and the app must say so.

## 2. Reality check (read before building)

1. **"1-bit" is not 1 bit.** Post-training IQ1_S measures about **2.0 bits/weight** on Llama-3.1-8B (llama.cpp quantize README), because embeddings and output tensors stay higher. Nominal numbers (1.56) are misleading. Use the measured table below for memory maths.
2. **Quality collapses at the bottom.** IQ1/IQ2 on a 12B is usually barely coherent; it works much better on 30B+ models. The UI must show a quality tier and a plain warning, and never present these as equal to Q4.
3. **Conversion needs the original weights.** A 12B in BF16 is about 24 GB to download, plus a ~24 GB F16 GGUF temp file, plus the output. That is 50+ GB of disk and a long download. So **prefer downloading an existing GGUF quant** (community repos publish most popular models, often with an importance matrix, which matters a lot at low bits). Convert locally only as a fallback.
4. **Importance matrix (imatrix).** Strongly recommended for anything under ~3 bits; the README only says it "minimizes accuracy loss" and does not state a hard requirement, so test with the pinned llama.cpp build whether `IQ1_S` / `IQ2_XXS` refuse to run without one. Computing an imatrix locally needs the model running at higher precision, which a 4 GB laptop cannot do quickly. So: download a published imatrix when it exists, otherwise warn.
5. **A model that fits can still be slow.** At 4 GB VRAM a 12B Q1 weights file nearly fills the GPU; KV cache and overhead push layers to the CPU. The existing engine already models this (split GPU+RAM). Show the speed range, not just "fits".
6. **Licences.** Gated models (Llama, Gemma) need the user to accept the licence on Hugging Face. Never upload converted files anywhere; local use only.

## 3. Measured sizes (bits per weight, Llama-3.1-8B, from the llama.cpp quantize README)

| Type | bpw | | Type | bpw |
|---|---|---|---|---|
| IQ1_S | 2.00 | | Q3_K_S | 3.64 |
| IQ1_M | 2.15 | | Q3_K_M | 4.00 |
| IQ2_XXS | 2.38 | | IQ4_XS | 4.46 |
| IQ2_XS | 2.59 | | Q4_K_M | 4.89 |
| IQ2_S | 2.74 | | Q5_K_M | 5.70 |
| IQ2_M | 2.93 | | Q6_K | 6.56 |
| Q2_K_S | 2.97 | | Q8_0 | 8.50 |
| Q2_K | 3.16 | | F16 | 16.0 |
| IQ3_XXS | 3.25 | | IQ3_S | 3.66 |

Worked example, 12B on 4 GB VRAM: IQ1_S = 12e9 x 2.0 / 8 = 3.0 GB (2.8 GiB) of weights. With ~0.3 GiB KV at 2K context and ~0.5 GiB runtime overhead it just fits in 4 GiB. IQ2_XXS = 3.3 GiB of weights will not fit fully, so it splits to the CPU.

## 4. Strategy: three tiers, cheapest first

```
User picks model + target quant
  1. FIND   an existing GGUF on Hugging Face with that quant   -> download one file (2-8 GB)
  2. FETCH  an existing F16/BF16 GGUF, then llama-quantize     -> download ~2x params GB, quantize locally
  3. BUILD  from safetensors: convert_hf_to_gguf.py -> quantize -> delete temp   (slowest, biggest disk)
```

Always show before starting: download size, peak disk, estimated time, and the predicted speed range from the existing engine. Let the user cancel.

## 5. Tooling: what to use

| Need | Use | Why |
|---|---|---|
| Quantize | `llama-quantize` (llama.cpp release binary) | Reference implementation, all K and IQ types |
| imatrix | `llama-imatrix` (same release) or a downloaded `imatrix.dat/.gguf` | Quality at low bits |
| HF to GGUF | `convert_hf_to_gguf.py` + `gguf` py package | Official converter; needs Python + torch (CPU wheel) |
| Run | `llama-server` (same release) | Runs any GGUF; app already speaks its OpenAI API and reads its `timings` |
| Quality sanity | `llama-perplexity` on a small text, plus fixed prompts | Cheap regression signal |
| Python | `uv` to create an isolated venv on demand | No system Python needed, reproducible |

**Do not bundle these in the installer.** Download on first use ("Install Fit tools", ~60 MB for binaries, ~700 MB more for the optional converter env). Reasons: the right backend differs per machine, installer stays small, binaries update independently.

Pick the llama.cpp release asset from detected hardware (existing `MachineProfile`):
- NVIDIA on Windows: CUDA build (+ matching cudart zip)
- AMD or Intel on Windows/Linux: Vulkan build (widest compatibility; add HIP later)
- Apple Silicon: macOS arm64 build (Metal)
- otherwise CPU build (AVX2)

Verify every download: GitHub release assets expose a SHA-256 `digest`; HF LFS files expose `lfs.oid` (sha256). Refuse on mismatch.

## 6. Architecture (new files)

```
src/core/quantplan.ts        pure: choose quant for hardware, estimate disk/RAM/time, quality tier   (unit tested)
src/core/quant.ts            extend QUANTS with IQ types and measured bpw
src/main/fit/binaries.ts     download + verify + unpack llama.cpp release, pick backend
src/main/fit/hfgguf.ts       find GGUF repos/files, resumable download, split-file handling
src/main/fit/pyenv.ts        uv venv + pinned deps for convert_hf_to_gguf.py (optional, on demand)
src/main/fit/convert.ts      safetensors -> f16/bf16 gguf
src/main/fit/quantize.ts     llama-quantize wrapper with progress parsing + cancel
src/main/fit/jobs.ts         job queue, disk checks, cleanup of temp files
src/main/runtime/llamaserver.ts   launch/stop llama-server for a GGUF, implement the Runtime interface
src/renderer/pages/FitStudio.tsx  UI
shared/ipc.ts                new channels: fit:plan, fit:tools, fit:start, fit:cancel + events fit:progress, fit:done
tests/quantplan.test.ts, tests/hfgguf.test.ts (mocked HF), tests/quantize.test.ts (fake binary)
```

Hard rules (keep the existing security model): spawn with an args array, never a shell; fixed working dir inside `userData/fit/`; new IPC channels go in the allowlist in `shared/ipc.ts`; validate every renderer-supplied string (HF id regex, quant name from a fixed list); refuse `trust_remote_code` and any `.bin`/pickle weights (safetensors only); network only to `huggingface.co`, `github.com` release hosts and `pypi`/`download.pytorch.org` via uv, and only after the user clicks Install.

## 7. Code snippets

### 7.1 Extend the quant table (`src/core/quant.ts`)

```ts
export type QuantId =
  | "F16" | "Q8_0" | "Q6_K" | "Q5_K_M" | "Q4_K_M" | "IQ4_XS" | "Q3_K_M" | "IQ3_S" | "IQ3_XXS"
  | "Q2_K" | "IQ2_M" | "IQ2_S" | "IQ2_XS" | "IQ2_XXS" | "IQ1_M" | "IQ1_S" | "MXFP4";

// bpw = measured bits per weight (llama.cpp quantize README, Llama-3.1-8B). quality = rough share of
// F16 quality, a ranking aid only; replace with measured perplexity when you have it.
// tier: "safe" fine for daily use, "lossy" noticeable loss, "experimental" often incoherent on small models.
export const QUANTS: Record<QuantId, { bpw: number; quality: number; tier: "safe" | "lossy" | "experimental" }> = {
  F16: { bpw: 16.0, quality: 1.0, tier: "safe" },   Q8_0: { bpw: 8.5, quality: 0.995, tier: "safe" },
  Q6_K: { bpw: 6.56, quality: 0.99, tier: "safe" }, Q5_K_M: { bpw: 5.7, quality: 0.98, tier: "safe" },
  Q4_K_M: { bpw: 4.89, quality: 0.96, tier: "safe" }, IQ4_XS: { bpw: 4.46, quality: 0.955, tier: "safe" },
  Q3_K_M: { bpw: 4.0, quality: 0.90, tier: "lossy" }, IQ3_S: { bpw: 3.66, quality: 0.89, tier: "lossy" },
  IQ3_XXS: { bpw: 3.25, quality: 0.85, tier: "lossy" }, Q2_K: { bpw: 3.16, quality: 0.78, tier: "lossy" },
  IQ2_M: { bpw: 2.93, quality: 0.80, tier: "lossy" }, IQ2_S: { bpw: 2.74, quality: 0.75, tier: "experimental" },
  IQ2_XS: { bpw: 2.59, quality: 0.72, tier: "experimental" }, IQ2_XXS: { bpw: 2.38, quality: 0.68, tier: "experimental" },
  IQ1_M: { bpw: 2.15, quality: 0.55, tier: "experimental" }, IQ1_S: { bpw: 2.0, quality: 0.45, tier: "experimental" },
  MXFP4: { bpw: 4.5, quality: 0.95, tier: "safe" },
};
```
Keep the existing tests passing, then add: IQ1_S weights for an 8B model are about 1.9 GiB.

### 7.2 Pick the best quant that fits (`src/core/quantplan.ts`)

```ts
import { evaluateAllQuants } from "./decide";
import { QUANTS } from "./quant";

/** Highest-quality quant that fits right now, plus the lowest-bit fallback if none do. */
export function bestFit(machine: MachineProfile, model: ModelSpec, ctx: number) {
  const all = evaluateAllQuants(machine, model, { ctx });
  const fits = all.filter((v) => v.fitsNow).sort((a, b) => QUANTS[b.quant].quality - QUANTS[a.quant].quality);
  return { best: fits[0] ?? null, all, impossible: fits.length === 0 };
}

export type Route = "download-quant" | "quantize-from-gguf" | "convert-from-hf";
export interface PathEstimate { route: Route; downloadGiB: number; peakDiskGiB: number; ramGiB: number; minutes: [number, number] }

export function estimatePath(route: Route, paramsB: number, quant: QuantId, bwMbps: number): PathEstimate {
  const f16 = (paramsB * 2) / 1.0737;                 // GiB of an F16/BF16 copy
  const out = (paramsB * QUANTS[quant].bpw) / 8 / 1.0737;
  const dl = route === "download-quant" ? out : f16;
  const disk = route === "download-quant" ? out : route === "quantize-from-gguf" ? f16 + out : f16 * 2 + out;
  const ram = route === "convert-from-hf" ? Math.min(f16, 16) : 2;     // refine by measuring
  const dlMin = (dl * 8192) / bwMbps / 60;
  const work = route === "download-quant" ? 0 : route === "quantize-from-gguf" ? paramsB * 0.4 : paramsB * 1.2;
  return { route, downloadGiB: dl, peakDiskGiB: disk, ramGiB: ram, minutes: [dlMin + work * 0.5, dlMin + work * 2] };
}
```
The `work` constants are guesses. Measure on real hardware and replace; show ranges only.

### 7.3 Find an existing GGUF on Hugging Face (`src/main/fit/hfgguf.ts`)

```ts
const HF = "https://huggingface.co";
const ID = /^[\w.-]+\/[\w.-]+$/;

export interface GgufFile { repo: string; path: string; size: number; sha256: string; parts: number }

/** Search repos that mirror this model as GGUF, then pick the file for the requested quant. */
export async function findGguf(baseModelId: string, quant: string): Promise<GgufFile[]> {
  if (!ID.test(baseModelId)) throw new Error("Invalid model id");
  const name = baseModelId.split("/")[1];
  const res = await fetch(`${HF}/api/models?search=${encodeURIComponent(name + " GGUF")}&limit=20&sort=downloads`);
  const repos: Array<{ id: string }> = await res.json();
  const out: GgufFile[] = [];
  for (const r of repos) {
    if (!ID.test(r.id)) continue;
    const tree: Array<{ path: string; size: number; lfs?: { oid: string } }> =
      await (await fetch(`${HF}/api/models/${r.id}/tree/main`)).json();
    const q = quant.toLowerCase();
    const hits = tree.filter((f) => f.path.toLowerCase().endsWith(".gguf") && f.path.toLowerCase().includes(q));
    if (hits.length) {
      // split files look like name-00001-of-00003.gguf; download all parts together
      out.push({ repo: r.id, path: hits[0].path, size: hits.reduce((a, h) => a + h.size, 0), sha256: hits[0].lfs?.oid ?? "", parts: hits.length });
    }
  }
  return out;   // UI lets the user choose; rank by downloads and by exact base-model match
}
```
Check the search result really is the same base model (compare the repo's `base_model` tag in `/api/models/{id}`) before offering it.

### 7.4 Resumable verified download

```ts
import { createWriteStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";

export async function download(url: string, dest: string, sha256: string, onProgress: (done: number, total: number) => void, signal: AbortSignal) {
  const tmp = dest + ".part";
  const have = await fs.stat(tmp).then((s) => s.size).catch(() => 0);
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal });
  if (!res.ok && res.status !== 206) throw new Error(`Download failed (${res.status})`);
  const total = have + Number(res.headers.get("content-length") ?? 0);
  const out = createWriteStream(tmp, { flags: have ? "a" : "w" });
  let done = have;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    out.write(chunk); done += chunk.length; onProgress(done, total);
  }
  await new Promise((r) => out.end(r));
  const h = createHash("sha256");
  for await (const c of (await fs.open(tmp)).createReadStream()) h.update(c);
  if (sha256 && h.digest("hex") !== sha256) { await fs.rm(tmp); throw new Error("Checksum mismatch; file discarded"); }
  await fs.rename(tmp, dest);
}
```

### 7.5 Run llama-quantize with progress and cancel (`src/main/fit/quantize.ts`)

```ts
import { spawn } from "node:child_process";

const ALLOWED = new Set(Object.keys(QUANTS));   // never pass user text straight through

export function quantize(bin: string, input: string, output: string, type: QuantId, imatrix: string | null,
                         threads: number, onLine: (l: string) => void, signal: AbortSignal): Promise<void> {
  if (!ALLOWED.has(type)) throw new Error("Unknown quantization");
  const args = [...(imatrix ? ["--imatrix", imatrix] : []), input, output, type, String(threads)];
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { shell: false, windowsHide: true });
    signal.addEventListener("abort", () => p.kill());
    const feed = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(onLine);
    p.stdout.on("data", feed); p.stderr.on("data", feed);   // llama.cpp logs progress to stderr
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(signal.aborted ? "Cancelled" : `llama-quantize exited with ${c}`))));
  });
}
// Progress lines look like: "[ 123/ 291] blk.10.attn_q.weight - ... " -> parse the two numbers for a percent.
```

### 7.6 Convert from Hugging Face weights (fallback tier)

```ts
// Inside the uv-managed venv, never the system Python:
//   python convert_hf_to_gguf.py <model_dir> --outfile <out.gguf> --outtype bf16
// To save disk you can write --outtype q8_0 directly, but quantizing again from Q8_0 needs --allow-requantize
// and loses quality versus quantizing from bf16/f16. Prefer bf16/f16 as the intermediate when disk allows.
//
// Pin versions in a lockfile: torch (cpu wheel), transformers, safetensors, numpy, sentencepiece, gguf,
// and pin the llama.cpp tag whose convert script matches the binaries you downloaded.
```
Download only `*.safetensors`, `config.json`, `tokenizer*`, `generation_config.json` (use `allow_patterns`). Reject repos that ship only `.bin`.

### 7.7 Run the result with llama-server

```ts
// args: -m model.gguf -c <ctx> -ngl <layers on GPU> --port <free loopback port> --host 127.0.0.1
// -ngl comes from the engine's plan: split.gpuFraction * model layers (round down).
// Reuse OpenAIRuntime: it already reads `timings.predicted_per_second` from llama-server for exact tok/s.
```

### 7.8 Quality sanity check after quantizing (cheap, honest)

```ts
// 1. llama-perplexity on ~200 KB of bundled public-domain text. Compare against a stored value per
//    (model, quant) from the community hub when available; otherwise just show the number with no verdict.
// 2. Eight fixed prompts; flag "likely incoherent" if output repeats a 3-gram > 5 times, has < 40% dictionary
//    words, or never emits an end-of-text token. Show as a hint, not a score.
```

## 8. UI: "Fit Studio" page

1. Model picker (catalog or Hugging Face id, reuse "Can I run it?").
2. **Quantization ladder**: one row per quant from Q8 down to IQ1_S: size, "fits now / fits if you close apps / split with RAM / no", speed range, quality tier chip (Safe / Lossy / Experimental).
3. Selecting a row shows the route (download vs convert), download size, peak disk, time range, and a plain warning for Experimental.
4. One button: "Get this version". Progress, cancel, disk-space guard (refuse if free disk < peak + 2 GiB).
5. When ready: "Test it" opens the Lab with the new model on `llama-server`.
6. Achievements, local only and optional: "Ran a 12B on 4 GB" is shown when the GGUF's size is larger than the GPU's VRAM and the run completed. Do not gamify low-quality outputs as success; require the sanity check to pass for the badge.

## 9. Milestones and acceptance tests

1. **Quant table + planner** (pure). Tests: 12B on 4 GiB VRAM yields best fit IQ1_S or a split plan, never Q4; sizes match the bpw table within 2%; tier labels set.
2. **Tools installer.** Downloads the llama.cpp release for the detected backend into `userData/fit/bin`, verifies sha256, runs `llama-quantize --help`. Test with a local mock HTTP server and a fake archive.
3. **HF GGUF finder + downloader.** Mocked HF API tests: split files, resume after abort, checksum mismatch deletes file, wrong base model rejected.
4. **Quantize wrapper.** Test with a fake binary script that prints progress; cancel kills the process; unknown quant name rejected before spawn.
5. **llama-server runtime.** Start/stop, free port on loopback only, tok/s from `timings`, falls back cleanly when the port is taken.
6. **Convert tier** (optional install). End to end with a tiny model (for example a 0.5B) on a real machine.
7. **UI + e2e** with the mock servers; then a manual run on a real 4 GB GPU laptop.
8. **Calibration reuse.** After a run, feed measured tok/s into the existing calibration so predictions improve (stream size = actual GGUF size).

## 10. Risks and how to handle them

| Risk | Handling |
|---|---|
| Users see gibberish at 1-2 bits and blame the app | Experimental tier label, sanity check, "try IQ2_M / Q3 with a smaller model" suggestions |
| 50+ GB disk for conversion | Show peak disk before starting; prefer tier 1; delete temps immediately; resume support |
| Wrong binary for the GPU | Backend chosen from detection with a manual override; Vulkan as the safe default on AMD/Intel |
| llama.cpp format changes break conversion | Pin a llama.cpp tag; converter script and binaries from the same tag |
| Malicious repo or archive | Safetensors only, no `trust_remote_code`, checksum verification, args-array spawn, loopback-only server |
| Licence-gated models | Detect 401/403, explain how to accept the licence, never bypass |
| Time estimates wrong | Show ranges, label as estimates, replace constants with measurements |

## 11. Out of scope for the first release

Training or fine-tuning, QAT/BitNet-style true 1-bit models (a separate catalogue of models trained for it), NPU execution, uploading converted files.

## 12. What not to do with `amd_llm_lab_master.csv`

The CSV measures Transformers + Optimum Quanto on one MI300X. Do not use it to predict laptop or GGUF behaviour, and do not retrain the speed model on it (see the chat notes). Keep it as labelled "reference: datacenter, Transformers" rows in the hub.
