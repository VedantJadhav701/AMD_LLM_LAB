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
  const { navArg, settings, rev } = useApp();
  const [catalog, setCatalog] = useState<ModelSpec[]>([]);
  const [modelId, setModelId] = useState<string>((navArg as { modelId?: string } | null)?.modelId ?? "qwen2.5-14b");
  const [ctx, setCtx] = useState<number | null>(null);
  const [spec, setSpec] = useState<ModelSpec | null>(null);
  const [vs, setVs] = useState<Verdict[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mbps, setMbps] = useState(100);
  const [hf, setHf] = useState(""); const [busy, setBusy] = useState(false);
  const c = ctx ?? settings?.defaultCtx ?? 4096;

  useEffect(() => { void api.invoke("catalog:list").then(setCatalog); }, []);
  useEffect(() => {
    let live = true; setVs(null); setErr(null);
    api.invoke("decide:evaluate", { modelId, ctx: c, extended: true }).then((r) => { if (!live) return; setSpec(r.spec); setVs(r.verdicts); const b = bestFit(r.verdicts); setSel((b.best ?? b.closeApps ?? b.smallest)?.quant ?? null); }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [modelId, c, rev]);
  async function lookup() { setBusy(true); setErr(null); try { const r = await api.invoke("hf:lookup", hf); setCatalog((x) => (x.some((m) => m.id === r.spec.id) ? x : [r.spec, ...x])); setModelId(r.spec.id); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }

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
      <div className="grid g3" style={{ alignItems: "end" }}>
        <label className="f">Model<select value={modelId} onChange={(e) => setModelId(e.target.value)}>{catalog.map((m) => <option key={m.id} value={m.id}>{m.name}{m.source === "huggingface" ? " (Hugging Face)" : ""}</option>)}</select></label>
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
            <div className="stack" style={{ gap: 8 }}>
              {dl ? <div className="row between"><span>{ROUTES["download-quant"]}</span><span className="mono dim">{fmtGiB(dl.downloadGiB)} · {min(dl.minutes)}</span></div> : null}
              {cv ? <div className="row between"><span>{ROUTES["convert-from-hf"]}</span><span className="mono dim">up to {fmtGiB(cv.peakDiskGiB)} disk · {min(cv.minutes)}</span></div> : null}
              <label className="f" style={{ marginTop: 4 }}>Your download speed<select value={mbps} onChange={(e) => setMbps(Number(e.target.value))}>{[25, 50, 100, 300, 1000].map((x) => <option key={x} value={x}>{x} Mbps</option>)}</select></label>
              <div className="dim" style={{ fontSize: 12 }}>Time estimates are rough planning numbers. Ready-made files are usually available for popular models.</div>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={() => api.invoke("app:openExternal", search)}>Find this download</button>
              <span className="dim" style={{ fontSize: 12 }}>Opens Hugging Face. One-click download and conversion inside the app is the next milestone.</span>
            </div>
          </div>
        ) : null}
      </div>
    </>) : null}
  </>);
}
