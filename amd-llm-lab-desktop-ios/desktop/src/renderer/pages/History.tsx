import { useEffect, useState } from "react";
import type { BenchResult } from "../../shared/types";
import { Empty } from "../components/ui";
import { api, useApp } from "../state";

export function HistoryPage() {
  const { go, settings } = useApp();
  const [rows, setRows] = useState<BenchResult[] | null>(null);
  const [share, setShare] = useState<{ id: string; payload?: unknown; error?: string; done?: string } | null>(null);
  useEffect(() => { void api.invoke("history:list").then(setRows); }, []);
  async function preview(id: string) { const p = await api.invoke("hub:preview", id); setShare("error" in p ? { id, error: p.error } : { id, payload: p.payload }); }
  async function submit(id: string) {
    try { const r = await api.invoke("hub:submit", id); setShare({ id, done: `Submitted (${r.status}).` }); setRows(await api.invoke("history:list")); }
    catch (e) { setShare({ id, error: (e as Error).message }); }
  }
  return (<>
    <h1>Your benchmark runs</h1>
    <p className="lead">Stored only on this computer.</p>
    {!rows ? null : rows.length === 0 ? <Empty title="No runs yet" action={<button className="btn primary" onClick={() => go("lab")}>Open the Lab</button>}>Run a benchmark and it is saved here.</Empty> : (
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table>
        <thead><tr><th>When</th><th>Model</th><th>Speed</th><th>On GPU</th><th>Machine</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="mono">{new Date(r.at).toLocaleString()}</td>
            <td>{r.model}<div className="dim mono" style={{ fontSize: 12 }}>{r.quant} · {r.runtimeName}</div></td>
            <td><b>{r.decodeTokS?.toFixed(1) ?? "–"}</b> tok/s</td>
            <td>{r.placement.gpuFraction == null ? "?" : `${Math.round(r.placement.gpuFraction * 100)}%`}</td>
            <td className="muted" style={{ fontSize: 13 }}>{r.machineSummary}</td>
            <td><div className="row" style={{ flexWrap: "nowrap" }}>
              {r.shared ? <span className="dim">Shared</span> : <button className="btn sm" onClick={() => preview(r.id)}>Share…</button>}
              <button className="btn sm ghost" onClick={async () => setRows(await api.invoke("history:delete", r.id))}>Delete</button>
            </div></td>
          </tr>))}</tbody>
      </table></div>)}
    {share ? (
      <div className="sheet-back" onClick={() => setShare(null)}><div className="sheet" role="dialog" aria-label="Share with the community hub" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Share with the community hub</h2>
        {share.error ? <div className="flag warn">{share.error}</div> : share.done ? <div>{share.done}</div> : <>
          <p className="muted">This is exactly what would be sent. It contains no name, account or file paths.</p>
          <pre className="mono" style={{ background: "var(--fill)", borderRadius: 12, padding: 12, overflow: "auto", maxHeight: 260 }}>{JSON.stringify(share.payload, null, 2)}</pre>
          {settings?.hubUrl ? <button className="btn primary" style={{ marginTop: 12 }} onClick={() => submit(share.id)}>Send</button> : <div className="flag info" style={{ marginTop: 12 }}>Add the hub address in Settings to enable sending.</div>}
        </>}
        <div className="row" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => setShare(null)}>Close</button></div>
      </div></div>) : null}
    {rows?.length ? <button className="btn sm ghost" style={{ marginTop: 16 }} onClick={async () => { await api.invoke("history:clear"); setRows([]); }}>Clear all</button> : null}
  </>);
}
