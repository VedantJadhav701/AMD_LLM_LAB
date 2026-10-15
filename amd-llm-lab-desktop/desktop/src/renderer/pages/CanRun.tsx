import { useEffect, useState } from "react";
import { fmtGiB } from "../../core/format";
import type { ModelSpec, Verdict } from "../../shared/types";
import { CtxSelect, Empty, LevelPill, Skeleton, Speed, VerdictBody } from "../components/ui";
import { api, useApp } from "../state";

export function CanRun() {
  const { navArg, settings, rev, go } = useApp();
  const [catalog, setCatalog] = useState<ModelSpec[]>([]);
  const [modelId, setModelId] = useState<string>((navArg as { modelId?: string } | null)?.modelId ?? "llama-3.1-8b");
  const [ctx, setCtx] = useState<number | null>(null);
  const [spec, setSpec] = useState<ModelSpec | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [hf, setHf] = useState(""); const [hfBusy, setHfBusy] = useState(false); const [hfWarn, setHfWarn] = useState<string[]>([]);
  const c = ctx ?? settings?.defaultCtx ?? 4096;

  useEffect(() => { void api.invoke("catalog:list").then(setCatalog); }, []);
  useEffect(() => {
    let live = true; setVerdicts(null); setErr(null);
    api.invoke("decide:evaluate", { modelId, ctx: c }).then((r) => { if (!live) return; setSpec(r.spec); setVerdicts(r.verdicts); const best = r.verdicts.findIndex((v) => v.fitsNow && v.level !== "wont_run"); setSel(best >= 0 ? best : 0); }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [modelId, c, rev]);

  async function lookup() {
    setHfBusy(true); setErr(null); setHfWarn([]);
    try { const r = await api.invoke("hf:lookup", hf); setHfWarn(r.warnings); setCatalog((x) => (x.some((m) => m.id === r.spec.id) ? x : [r.spec, ...x])); setModelId(r.spec.id); }
    catch (e) { setErr((e as Error).message); } finally { setHfBusy(false); }
  }

  const [filter, setFilter] = useState("");
  const filteredCatalog = catalog.filter((m) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.family.toLowerCase().includes(filter.toLowerCase()) || m.id.toLowerCase().includes(filter.toLowerCase()));

  const groupedCatalog = filteredCatalog.reduce<Record<string, ModelSpec[]>>((acc, m) => {
    const fam = m.family || "Other";
    if (!acc[fam]) acc[fam] = [];
    acc[fam].push(m);
    return acc;
  }, {});

  const v = verdicts?.[sel];
  return (
    <>
      <div className="eyebrow">Can I run it?</div>
      <h1>Check any model before you download it</h1>
      <p className="lead">Pick a model from the catalog, or paste a Hugging Face id. Only the small config file is fetched, never the model weights.</p>
      <div className="card" style={{ marginBottom: 20 }}>
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
            <button className="btn" disabled={!hf || hfBusy} onClick={lookup}>{hfBusy ? "…" : "Look up"}</button>
          </div>
        </div>
        {hfWarn.map((w) => <div key={w} className="flag warn" style={{ marginTop: 12 }}>{w}</div>)}
      </div>
      {err ? <Empty title="Could not check this model">{err}</Empty> : null}
      {!verdicts && !err ? <Skeleton n={2} /> : null}
      {verdicts && spec ? (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1.1fr", alignItems: "start" }}>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Quality level</th><th>Size</th><th>Verdict</th></tr></thead>
              <tbody>{verdicts.map((x, i) => (
                <tr key={x.quant} className={`click ${i === sel ? "sel" : ""}`} onClick={() => setSel(i)}>
                  <td><b>{x.quant}</b></td><td className="mono">{fmtGiB(x.fileGiB)}</td><td><LevelPill level={x.level} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          {v ? (
            <div className="card">
              <h2>{spec.name}</h2>
              {spec.approx ? <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>Sizes for this model are estimated.</div> : null}
              <VerdictBody v={v} />
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn primary" onClick={() => go("lab", { catalogId: spec.id })}>Test in the Lab</button>
                {spec.maxContext && v.maxContext ? <span className="dim" style={{ fontSize: 13 }}>Longest context that fits: {v.maxContext.toLocaleString()} tokens</span> : null}
              </div>
              {v.alternatives.length ? <details style={{ marginTop: 16 }}><summary className="muted">Other ways to run it</summary>{v.alternatives.map((p, i) => <div key={i} className="row between" style={{ padding: "10px 0", borderBottom: ".5px solid var(--sep)" }}><span>{p.where}</span><Speed plan={p} big={false} /></div>)}</details> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
