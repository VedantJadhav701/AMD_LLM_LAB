import { useEffect, useMemo, useState } from "react";
import { fmtGiB } from "../../core/format";
import { QUANTS } from "../../core/quant";
import { bestFit, estimatePath, type Route } from "../../core/quantplan";
import type { ModelSpec, Verdict } from "../../shared/types";
import { CtxSelect, Empty, LevelPill, Skeleton, Speed, VerdictBody } from "../components/ui";
import { api, useApp } from "../state";

const TIER: Record<string, { label: string; cls: string }> = {
  lossless: { label: "Safe", cls: "t-safe" }, "near-lossless": { label: "Safe", cls: "t-safe" }, "small loss": { label: "Safe", cls: "t-safe" },
  "noticeable loss": { label: "Lossy", cls: "t-lossy" }, "large loss": { label: "Lossy", cls: "t-lossy" }, experimental: { label: "Experimental", cls: "t-exp" },
};
const ROUTES: Record<Route, string> = { "download-quant": "Download a ready-made file", "quantize-from-gguf": "Download a 16-bit file, then shrink it here", "convert-from-hf": "Download the original weights, convert, then shrink" };

export function FitStudio() {
  const { navArg, settings, rev, go } = useApp();
  const [catalog, setCatalog] = useState<ModelSpec[]>([]);
  const [modelId, setModelId] = useState<string>((navArg as { modelId?: string } | null)?.modelId ?? "qwen2.5-14b");
  const [ctx, setCtx] = useState<number | null>(null);
  const [spec, setSpec] = useState<ModelSpec | null>(null);
  const [vs, setVs] = useState<Verdict[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mbps, setMbps] = useState(100);
  const [hf, setHf] = useState(""); const [busy, setBusy] = useState(false);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<{ status: string; percent: number; downloadedMB: number; totalMB: number; speedMBps: number } | null>(null);
  const [dlCompletedPath, setDlCompletedPath] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const c = ctx ?? settings?.defaultCtx ?? 4096;

  useEffect(() => { void api.invoke("catalog:list").then(setCatalog); }, []);
  useEffect(() => {
    let live = true; setVs(null); setErr(null);
    api.invoke("decide:evaluate", { modelId, ctx: c, extended: true }).then((r) => { if (!live) return; setSpec(r.spec); setVs(r.verdicts); const b = bestFit(r.verdicts); setSel((b.best ?? b.closeApps ?? b.smallest)?.quant ?? null); }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [modelId, c, rev]);

  useEffect(() => {
    const offProg = api.on("download:progress", (p) => {
      if (downloadId && p.id === downloadId) {
        setDlProgress(p);
      }
    });
    const offDone = api.on("download:done", (d) => {
      if (downloadId && d.id === downloadId) {
        setDownloading(false);
        if (d.error) {
          setDlError(d.error);
        } else if (d.filePath) {
          setDlCompletedPath(d.filePath);
        }
      }
    });
    return () => {
      offProg();
      offDone();
    };
  }, [downloadId]);

  const handleDownload = async () => {
    if (!spec || !cur) return;
    setDownloading(true);
    setDlError(null);
    setDlCompletedPath(null);
    setDlProgress({ status: "Connecting to Hugging Face...", percent: 0, downloadedMB: 0, totalMB: 0, speedMBps: 0 });
    try {
      const id = await api.invoke("download:start", {
        hfRepo: spec.hf ?? spec.id,
        quant: cur.quant,
      });
      setDownloadId(id);
    } catch (e) {
      setDownloading(false);
      setDlError((e as Error).message);
    }
  };

  const handleCancelDownload = () => {
    if (downloadId) {
      void api.invoke("download:cancel", downloadId);
    }
    setDownloading(false);
    setDlProgress(null);
  };

  async function lookup() { setBusy(true); setErr(null); try { const r = await api.invoke("hf:lookup", hf); setCatalog((x) => (x.some((m) => m.id === r.spec.id) ? x : [r.spec, ...x])); setModelId(r.spec.id); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }

  const [filter, setFilter] = useState("");
  const [method, setMethod] = useState<"stream" | "convert">("stream");
  const [autoCleanRaw, setAutoCleanRaw] = useState(true);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  const copyConversionScript = (shellType: "ps" | "bash") => {
    if (!spec || !cur) return;
    const cleanId = (spec.name || spec.id).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const hfRepo = spec.hf ?? spec.id;
    let script = "";

    if (shellType === "ps") {
      script = [
        `# === AMD LLM Lab - Local Quantization Pipeline ===`,
        `# Target Model: ${spec.name} (${spec.paramsB}B)`,
        `# Target Quantization: ${cur.quant}`,
        ``,
        `# 1. Download full unquantized weights from Hugging Face`,
        `pip install -U "huggingface_hub[cli]"`,
        `huggingface-cli download ${hfRepo} --local-dir ./models/${cleanId}`,
        ``,
        `# 2. Convert raw weights to intermediate FP16 GGUF`,
        `python ./llama.cpp/convert_hf_to_gguf.py ./models/${cleanId} --outfile ./${cleanId}-f16.gguf --outtype f16`,
        ``,
        `# 3. Quantize intermediate FP16 GGUF to ${cur.quant}`,
        `llama-quantize ./${cleanId}-f16.gguf ./${cleanId}-${cur.quant}.gguf ${cur.quant}`,
        ``,
        ...(autoCleanRaw
          ? [
              `# 4. Cleanup intermediate unquantized weights (saves ~${fmtGiB((cv?.peakDiskGiB ?? 0) - cur.fileGiB)})`,
              `Remove-Item -Recurse -Force ./models/${cleanId}`,
              `Remove-Item -Force ./${cleanId}-f16.gguf`,
              `Write-Host "Local quantization to ${cur.quant} complete! Model ready at: ./${cleanId}-${cur.quant}.gguf" -ForegroundColor Green`,
            ]
          : [`Write-Host "Quantization complete! Model ready at: ./${cleanId}-${cur.quant}.gguf" -ForegroundColor Green`]),
      ].join("\r\n");
    } else {
      script = [
        `#!/usr/bin/env bash`,
        `# === AMD LLM Lab - Local Quantization Pipeline ===`,
        `# Target Model: ${spec.name} (${spec.paramsB}B)`,
        `# Target Quantization: ${cur.quant}`,
        `set -e`,
        ``,
        `# 1. Download full unquantized weights from Hugging Face`,
        `pip install -U "huggingface_hub[cli]"`,
        `huggingface-cli download ${hfRepo} --local-dir ./models/${cleanId}`,
        ``,
        `# 2. Convert raw weights to intermediate FP16 GGUF`,
        `python ./llama.cpp/convert_hf_to_gguf.py ./models/${cleanId} --outfile ./${cleanId}-f16.gguf --outtype f16`,
        ``,
        `# 3. Quantize intermediate FP16 GGUF to ${cur.quant}`,
        `llama-quantize ./${cleanId}-f16.gguf ./${cleanId}-${cur.quant}.gguf ${cur.quant}`,
        ``,
        ...(autoCleanRaw
          ? [
              `# 4. Cleanup intermediate unquantized weights (saves ~${fmtGiB((cv?.peakDiskGiB ?? 0) - cur.fileGiB)})`,
              `rm -rf ./models/${cleanId} ./${cleanId}-f16.gguf`,
              `echo "Local quantization to ${cur.quant} complete! Model ready at: ./${cleanId}-${cur.quant}.gguf"`,
            ]
          : [`echo "Quantization complete! Model ready at: ./${cleanId}-${cur.quant}.gguf"`]),
      ].join("\n");
    }

    void navigator.clipboard.writeText(script);
    setCopiedScript(shellType);
    setTimeout(() => setCopiedScript(null), 2500);
  };

  const filteredCatalog = catalog.filter((m) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.family.toLowerCase().includes(filter.toLowerCase()) || m.id.toLowerCase().includes(filter.toLowerCase()));

  const groupedCatalog = useMemo(() => {
    return filteredCatalog.reduce<Record<string, ModelSpec[]>>((acc, m) => {
      const fam = m.family || "Other";
      if (!acc[fam]) acc[fam] = [];
      acc[fam].push(m);
      return acc;
    }, {});
  }, [filteredCatalog]);

  const fit = useMemo(() => (vs ? bestFit(vs) : null), [vs]);
  const cur = vs?.find((v) => v.quant === sel) ?? null;
  const q = cur ? QUANTS[cur.quant] : null;
  const search = spec ? `https://huggingface.co/models?search=${encodeURIComponent(`${(spec.hf ?? spec.name).split("/").pop()} GGUF`)}` : "";
  const dl = spec && cur ? estimatePath("download-quant", spec.paramsB, cur.quant, mbps) : null;
  const cv = spec && cur ? estimatePath("convert-from-hf", spec.paramsB, cur.quant, mbps) : null;
  const min = (m: [number, number]) => (m[1] < 1 ? "under a minute" : `${Math.max(1, Math.round(m[0]))}–${Math.round(m[1])} min`);

  return (<>
    <h1>Fit Studio</h1>
    <p className="lead">Pick any model, then choose how small to make it. Lower bit levels fit smaller laptops but lose quality, and the app tells you exactly what you trade.</p>
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="🔍 Search 45+ open-source models (DeepSeek, Llama, Qwen, Gemma, Mistral, Phi...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ fontSize: 13.5, padding: "8px 12px" }}
        />
      </div>
      <div className="grid g3" style={{ alignItems: "end" }}>
        <label className="f">
          Model
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {Object.entries(groupedCatalog).map(([family, models]) => (
              <optgroup key={family} label={`${family} (${models.length})`}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.paramsB}B)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <CtxSelect value={c} onChange={setCtx} />
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="f" style={{ flex: 1 }}>Or Hugging Face id<input placeholder="owner/name" value={hf} onChange={(e) => setHf(e.target.value)} onKeyDown={(e) => e.key === "Enter" && hf && lookup()} /></label>
          <button className="btn" disabled={!hf || busy} onClick={lookup}>{busy ? "…" : "Look up"}</button>
        </div>
      </div>
    </div>
    {err ? <Empty title="Could not check this model">{err}</Empty> : null}
    {!vs && !err ? <Skeleton n={2} /> : null}
    {vs && spec && fit ? (<>
      <div className={`callout ${fit.impossible ? "bad" : fit.best && (fit.best.level === "slow" || fit.best.level === "crawl") ? "warn" : fit.best ? "" : "warn"}`}>
        {fit.impossible ? <><h2>Not on this laptop</h2><div>Even the smallest level ({fit.smallest?.quant}) needs {fmtGiB(fit.smallest?.memory.totalGiB ?? 0)} and your machine cannot give that, even after closing other apps. A smaller model is the better path.</div></>
          : fit.best ? <><h2>{fit.best.level === "slow" || fit.best.level === "crawl" ? "Fits, but slowly" : "Best that fits"}: {fit.best.quant}</h2><div>{fit.best.headline} {QUANTS[fit.best.quant].tier === "experimental" ? "This is the experimental range, so expect weak answers." : ""}</div></>
          : <><h2>Close other apps to run {fit.closeApps?.quant}</h2><div>Nothing fits right now, but {fit.closeApps?.quant} would fit if you free some memory.</div></>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1.15fr 1fr", alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="ladder">
            <thead><tr><th>Level</th><th>Size</th><th>Quality</th><th>Result</th></tr></thead>
            <tbody>{vs.map((v) => {
              const t = TIER[QUANTS[v.quant].tier];
              return (
                <tr key={v.quant} className={`click ${v.quant === sel ? "sel" : ""}`} tabIndex={0} onClick={() => setSel(v.quant)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(v.quant)}>
                  <td>{v.quant}<div className="dim" style={{ fontSize: 12, fontWeight: 400 }}>{QUANTS[v.quant].bpw} bits</div></td>
                  <td className="mono">{fmtGiB(v.fileGiB)}</td>
                  <td><span className={`pill ${t.cls}`}>{t.label}</span></td>
                  <td><LevelPill level={v.level} /></td>
                </tr>);
            })}</tbody>
          </table>
        </div>
        {cur && q ? (
          <div className="card">
            <h2>{spec.name} · {cur.quant}</h2>
            <p className="muted" style={{ marginTop: 0 }}>{q.blurb}</p>
            <VerdictBody v={cur} />
            <h3 style={{ marginTop: 20 }}>How you would get it</h3>
            <div className="seg" style={{ width: "100%", marginBottom: 14 }}>
              <button
                type="button"
                className={method === "stream" ? "on" : ""}
                style={{ flex: 1, textAlign: "center", padding: "8px 10px", fontSize: 13 }}
                onClick={() => setMethod("stream")}
              >
                ⚡ Stream Ready-Made ({fmtGiB(dl?.downloadGiB ?? 0)})
              </button>
              <button
                type="button"
                className={method === "convert" ? "on" : ""}
                style={{ flex: 1, textAlign: "center", padding: "8px 10px", fontSize: 13 }}
                onClick={() => setMethod("convert")}
              >
                🛠️ Download & Convert ({fmtGiB(cv?.peakDiskGiB ?? 0)})
              </button>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {method === "stream" ? (
                <>
                  <div className="row between">
                    <span>Stream target GGUF from Hugging Face</span>
                    <span className="mono dim">{fmtGiB(dl?.downloadGiB ?? 0)} · {min(dl?.minutes ?? [0, 0])}</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Fast path: downloads pre-quantized {cur.quant} binary directly to local storage without burning CPU.
                  </div>
                </>
              ) : (
                <>
                  <div className="row between">
                    <span>Fetch original weights and quantize locally</span>
                    <span className="mono dim">up to {fmtGiB(cv?.peakDiskGiB ?? 0)} disk · {min(cv?.minutes ?? [0, 0])}</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Studio path: pulls original SafeTensors from {spec.hf ?? spec.id} and quantizes to {cur.quant} on your CPU/GPU.
                  </div>
                </>
              )}
              <label className="f" style={{ marginTop: 6 }}>Your download speed<select value={mbps} onChange={(e) => setMbps(Number(e.target.value))}>{[25, 50, 100, 300, 1000].map((x) => <option key={x} value={x}>{x} Mbps</option>)}</select></label>
            </div>
            <h3 style={{ marginTop: 20 }}>Download & Prepare</h3>
            {downloading ? (
              <div className="card" style={{ background: "var(--fill)", border: "1px solid var(--sep)", padding: 14 }}>
                <div className="row between" style={{ fontWeight: 600, fontSize: 13 }}>
                  <span>{dlProgress?.status || "Downloading..."}</span>
                  <span className="mono">{dlProgress ? `${dlProgress.percent}%` : "0%"}</span>
                </div>
                <div className="bar" style={{ height: 8, margin: "10px 0" }}>
                  <i style={{ width: `${dlProgress?.percent ?? 0}%` }} />
                </div>
                <div className="row between dim mono" style={{ fontSize: 12 }}>
                  <span>{dlProgress?.downloadedMB ?? 0} MB / {dlProgress?.totalMB ?? 0} MB</span>
                  <span>{dlProgress?.speedMBps ? `${dlProgress.speedMBps} MB/s` : ""}</span>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={handleCancelDownload}>Cancel Download</button>
                </div>
              </div>
            ) : dlCompletedPath ? (
              <div className="callout" style={{ background: "color-mix(in srgb, #34c759 14%, var(--card))", border: "1px solid rgba(52, 199, 89, 0.3)" }}>
                <h3 style={{ color: "#34c759", marginTop: 0 }}>✓ Download Complete</h3>
                <p style={{ fontSize: 13, margin: "4px 0" }}>GGUF model saved to disk and ready to run with llama.cpp or LM Studio:</p>
                <div className="mono dim" style={{ fontSize: 12, wordBreak: "break-all", background: "rgba(0,0,0,0.2)", padding: "6px 8px", borderRadius: 6, margin: "8px 0" }}>
                  {dlCompletedPath}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn primary"
                    onClick={() =>
                      go("lab", {
                        downloadedFile: dlCompletedPath,
                        modelName: `${(spec.name || "model").toLowerCase().replace(/[^a-z0-9]/g, "-")}:${cur.quant.toLowerCase()}`,
                      })
                    }
                  >
                    Open in Lab / Chat
                  </button>
                  <button className="btn" onClick={() => setDlCompletedPath(null)}>Done</button>
                </div>
              </div>
            ) : method === "convert" ? (
              <div className="stack" style={{ gap: 12 }}>
                <div className="card" style={{ background: "var(--fill)", border: "1px solid var(--sep)", padding: 14 }}>
                  <div className="row between" style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    <span>Local Quantization Pipeline for {cur.quant}</span>
                    <span className="mono dim">Peak Disk: {fmtGiB(cv?.peakDiskGiB ?? 0)}</span>
                  </div>
                  <div className="stack" style={{ gap: 6, fontSize: 12 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="dim">1.</span>
                      <span>Download unquantized SafeTensors from Hugging Face ({spec.hf ?? spec.id})</span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="dim">2.</span>
                      <span>Convert SafeTensors to intermediate FP16 GGUF via llama.cpp</span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="dim">3.</span>
                      <span>Quantize FP16 GGUF to target <b>{cur.quant}</b> (target size: {fmtGiB(cur.fileGiB)})</span>
                    </div>
                    {autoCleanRaw ? (
                      <div className="row" style={{ gap: 8, color: "#34c759" }}>
                        <span>✓</span>
                        <span>Auto-reclaim ~{fmtGiB((cv?.peakDiskGiB ?? 0) - cur.fileGiB)} disk by purging raw weights on completion</span>
                      </div>
                    ) : null}
                  </div>
                  <label className="row" style={{ marginTop: 12, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      style={{ width: 16 }}
                      checked={autoCleanRaw}
                      onChange={(e) => setAutoCleanRaw(e.target.checked)}
                    />
                    Purge raw weights and intermediate FP16 after quantization completes
                  </label>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn primary" onClick={() => copyConversionScript("ps")}>
                    {copiedScript === "ps" ? "✓ Copied PowerShell Script!" : "📋 Copy PowerShell Command"}
                  </button>
                  <button className="btn" onClick={() => copyConversionScript("bash")}>
                    {copiedScript === "bash" ? "✓ Copied Bash Script!" : "📋 Copy Bash Script"}
                  </button>
                  <button className="btn" onClick={() => api.invoke("app:openExternal", "https://github.com/ggerganov/llama.cpp#prepare-data--run")}>
                    llama.cpp Guide
                  </button>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Run the copied script in PowerShell or terminal with Python and llama.cpp installed to convert weights locally.
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {dlError ? (
                  <div className="flag bad">
                    <div>{dlError}</div>
                  </div>
                ) : null}
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn primary" onClick={handleDownload} disabled={downloading}>
                    Download this quant ({cur.quant})
                  </button>
                  <button className="btn" onClick={() => api.invoke("app:openExternal", search)}>
                    View on Hugging Face
                  </button>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Streams {fmtGiB(cur.fileGiB)} GGUF file directly to local storage with verified integrity.
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>) : null}
  </>);
}
