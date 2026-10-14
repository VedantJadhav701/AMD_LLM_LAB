import { deriveSpec, parseHfId, type DerivedSpec } from "../core/hfspec";

async function getJson(url: string, token?: string): Promise<unknown> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (res.status === 404) throw new Error("Model not found on Hugging Face.");
    if (res.status === 401 || res.status === 403) throw new Error("This model is gated or private. Accept its licence on Hugging Face first; the app does not sign in for you.");
    if (!res.ok) throw new Error(`Hugging Face returned ${res.status}.`);
    return await res.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Hugging Face did not answer in time. Check your connection.");
    if (e instanceof TypeError) throw new Error("Could not reach Hugging Face. You can still pick a model from the catalog while offline.");
    throw e;
  } finally { clearTimeout(t); }
}

/** Fetches only config.json and repository metadata (a few KB). No model files are downloaded. */
export async function lookupHf(input: string): Promise<DerivedSpec> {
  const id = parseHfId(input);
  if (!id) throw new Error("Enter a Hugging Face id like owner/name.");
  const [cfg, meta] = await Promise.all([
    getJson(`https://huggingface.co/${id}/resolve/main/config.json`),
    getJson(`https://huggingface.co/api/models/${id}`).catch(() => null),
  ]);
  const total = (meta as { safetensors?: { total?: number } } | null)?.safetensors?.total ?? null;
  const out = deriveSpec(id, cfg as Record<string, unknown>, total);
  if ("error" in out) throw new Error(out.error);
  return out;
}

export interface DownloadProgress {
  status: string;
  percent: number;
  downloadedMB: number;
  totalMB: number;
  speedMBps: number;
}

/** Finds the best matching GGUF repo or file on Hugging Face */
export async function findGgufFile(hfRepo: string, quant: string): Promise<{ repo: string; file: string; sizeBytes?: number }> {
  const qClean = quant.toLowerCase().replace(/[^a-z0-9_]/g, "");
  // If hfRepo already ends in -GGUF, check its tree
  const candidates = hfRepo.toLowerCase().endsWith("-gguf")
    ? [hfRepo]
    : [
        `${hfRepo}-GGUF`,
        `${hfRepo}-gguf`,
        `Qwen/${hfRepo.split("/").pop()}-GGUF`,
        `bartowski/${hfRepo.split("/").pop()}-GGUF`,
        `mradermacher/${hfRepo.split("/").pop()}-GGUF`,
        hfRepo,
      ];

  for (const repo of candidates) {
    try {
      const tree = (await getJson(`https://huggingface.co/api/models/${repo}/tree/main`)) as Array<{ path: string; size?: number; type: string }>;
      if (Array.isArray(tree)) {
        const ggufs = tree.filter((f) => f.path.toLowerCase().endsWith(".gguf"));
        // Match exact quant, e.g. .q4_k_m.gguf
        const match = ggufs.find((f) => f.path.toLowerCase().includes(qClean)) || ggufs[0];
        if (match) {
          return { repo, file: match.path, sizeBytes: match.size };
        }
      }
    } catch {
      // try next candidate
    }
  }

  // Fallback: search Hugging Face for GGUF repos for this model
  try {
    const modelBase = hfRepo.split("/").pop() || hfRepo;
    const searchUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(`${modelBase} GGUF`)}&limit=5`;
    const searchResults = (await getJson(searchUrl)) as Array<{ id: string }>;
    if (Array.isArray(searchResults)) {
      for (const item of searchResults) {
        if (!item?.id || candidates.includes(item.id)) continue;
        try {
          const tree = (await getJson(`https://huggingface.co/api/models/${item.id}/tree/main`)) as Array<{ path: string; size?: number; type: string }>;
          if (Array.isArray(tree)) {
            const ggufs = tree.filter((f) => f.path.toLowerCase().endsWith(".gguf"));
            const match = ggufs.find((f) => f.path.toLowerCase().includes(qClean)) || ggufs[0];
            if (match) {
              return { repo: item.id, file: match.path, sizeBytes: match.size };
            }
          }
        } catch {
          // ignore candidate error
        }
      }
    }
  } catch {
    // ignore search error
  }

  throw new Error(`Could not find a GGUF file for ${hfRepo} with quant ${quant} on Hugging Face.`);
}

/** Downloads a GGUF model directly from Hugging Face to local disk with streaming progress */
export async function downloadModelFromHf(
  opts: { hfRepo: string; quant: string; destDir: string; token?: string },
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { promises: fsp } = fs;

  onProgress({ status: "Locating file on Hugging Face...", percent: 0, downloadedMB: 0, totalMB: 0, speedMBps: 0 });
  const found = await findGgufFile(opts.hfRepo, opts.quant);

  await fsp.mkdir(opts.destDir, { recursive: true });
  const localFileName = path.basename(found.file);
  const destPath = path.join(opts.destDir, localFileName);
  const partPath = destPath + ".part";

  const url = `https://huggingface.co/${found.repo}/resolve/main/${encodeURIComponent(found.file)}`;
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`Hugging Face returned ${res.status} while downloading ${found.file}`);

  const totalBytes = Number(res.headers.get("content-length")) || found.sizeBytes || 0;
  const totalMB = totalBytes / (1024 * 1024);

  // Check available disk space
  if (totalBytes > 0 && typeof fsp.statfs === "function") {
    try {
      const stats = await fsp.statfs(opts.destDir);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (freeBytes < totalBytes + 200 * 1024 * 1024) {
        throw new Error(`Insufficient disk space: needs ${(totalBytes / 1e9).toFixed(1)} GB, but only ${(freeBytes / 1e9).toFixed(1)} GB is free.`);
      }
    } catch (e) {
      if ((e as Error).message.includes("Insufficient disk space")) throw e;
    }
  }

  if (!res.body) throw new Error("Empty response body from Hugging Face.");

  const fileStream = fs.createWriteStream(partPath);
  const reader = res.body.getReader();

  let downloadedBytes = 0;
  let lastTime = performance.now();
  let lastBytes = 0;
  let speedMBps = 0;

  try {
    while (true) {
      if (signal?.aborted) throw new Error("Download cancelled");
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(Buffer.from(value));
      downloadedBytes += value.length;

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      if (dt >= 0.5) {
        const deltaMB = (downloadedBytes - lastBytes) / (1024 * 1024);
        speedMBps = deltaMB / dt;
        lastTime = now;
        lastBytes = downloadedBytes;

        const downloadedMB = downloadedBytes / (1024 * 1024);
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        onProgress({
          status: `Downloading ${localFileName}...`,
          percent,
          downloadedMB: Math.round(downloadedMB * 10) / 10,
          totalMB: Math.round(totalMB * 10) / 10,
          speedMBps: Math.round(speedMBps * 10) / 10,
        });
      }
    }
    fileStream.end();
    await new Promise<void>((resolve) => fileStream.on("finish", () => resolve()));
    await fsp.rename(partPath, destPath);

    onProgress({
      status: `Completed ${localFileName}`,
      percent: 100,
      downloadedMB: Math.round(totalMB * 10) / 10,
      totalMB: Math.round(totalMB * 10) / 10,
      speedMBps: 0,
    });
    return destPath;
  } catch (err) {
    fileStream.close();
    await fsp.unlink(partPath).catch(() => undefined);
    throw err;
  }
}
