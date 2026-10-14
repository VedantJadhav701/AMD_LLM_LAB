import { Download, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BenchResult, ChatMessage, GenStats, InstalledModel } from "../../shared/types";
import { Empty, FormattedMessage } from "../components/ui";
import { api, useApp } from "../state";

type Msg = ChatMessage & { stats?: GenStats };
const fmt = (n: number | null | undefined, d = 1) => (n == null ? "–" : n.toFixed(d));

export function Lab() {
  const { runtimes, refreshRuntimes, settings, navArg, setCalibration, machine } = useApp();
  const online = runtimes.filter((r) => r.online);
  const [rtId, setRtId] = useState<string>(""); const [models, setModels] = useState<InstalledModel[]>([]);
  const [model, setModel] = useState<string>(""); const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [bench, setBench] = useState<{ step: string; frac: number } | null>(null); const [last, setLast] = useState<BenchResult | null>(null); const [benchErr, setBenchErr] = useState<string | null>(null);
  const [pullName, setPullName] = useState(""); const [pull, setPull] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null); const ctx = settings?.defaultCtx ?? 4096;
  const want = (navArg as { catalogId?: string } | null)?.catalogId;

  useEffect(() => { if (!rtId && online[0]) setRtId(online[0].id); }, [online, rtId]);
  const loadModels = async (id = rtId) => { if (!id) return; try { const m = await api.invoke("runtime:models", id); setModels(m); setLoadErr(null); setModel((cur) => cur && m.some((x) => x.name === cur) ? cur : m.find((x) => want && x.catalogId === want)?.name ?? m[0]?.name ?? ""); } catch (e) { setLoadErr((e as Error).message); } };
  useEffect(() => { void loadModels(); /* eslint-disable-next-line */ }, [rtId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  useEffect(() => {
    const off = [
      api.on("chat:token", (p) => setMsgs((m) => { const c = [...m]; const l = c[c.length - 1]; if (l?.role === "assistant") c[c.length - 1] = { ...l, content: l.content + p.text }; return c; })),
      api.on("chat:done", (p) => { setBusy(null); setMsgs((m) => { const c = [...m]; const l = c[c.length - 1]; if (l?.role === "assistant") c[c.length - 1] = { ...l, stats: p.stats }; return c; }); }),
      api.on("chat:error", (p) => { setBusy(null); setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${p.message}` }]); }),
      api.on("bench:progress", (p) => setBench({ step: p.step, frac: p.frac })),
      api.on("bench:done", (p) => { setBench(null); setBusy(null); if (p.error) setBenchErr(p.error); if (p.result) setLast(p.result); if (p.calibration) setCalibration(p.calibration); }),
      api.on("pull:progress", (p) => setPull(p.total ? `${p.status} ${Math.round(((p.completed ?? 0) / p.total) * 100)}%` : p.status)),
      api.on("pull:done", (p) => { setPull(p.error ? `⚠ ${p.error}` : null); if (!p.error) void loadModels(); }),
    ];
    return () => off.forEach((f) => f());
  }, [rtId]); // eslint-disable-line

  async function send() {
    if (!input.trim() || busy || !model) return;
    const next: Msg[] = [...msgs, { role: "user", content: input.trim() }];
    setMsgs([...next, { role: "assistant", content: "" }]); setInput(""); setBusy("chat");
    try { const id = await api.invoke("chat:start", { runtimeId: rtId, model, messages: next.map(({ role, content }) => ({ role, content })), ctx }); setBusy(id); }
    catch (e) { setBusy(null); setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠ ${(e as Error).message}` }]); }
  }
  async function runBench() {
    const m = models.find((x) => x.name === model); if (!m) return;
    setBusy("bench"); setLast(null); setBenchErr(null); setBench({ step: "Starting", frac: 0 });
    try { await api.invoke("bench:start", { runtimeId: rtId, model: m, ctx }); } catch (e) { setBusy(null); setBench(null); setBenchErr((e as Error).message); }
  }
  const sel = models.find((m) => m.name === model);
  const ollama = runtimes.find((r) => r.kind === "ollama");

  if (!online.length) return (<>
    <div className="eyebrow">Lab</div><h1>Test a model on this laptop</h1>
    <Empty title="No local model server found" action={<div className="row" style={{ justifyContent: "center" }}><button className="btn primary" onClick={() => api.invoke("app:openExternal", "https://ollama.com/download")}><Download size={16} />Get Ollama</button><button className="btn" onClick={refreshRuntimes}>Check again</button></div>}>
      Install Ollama (free), start it, and your models appear here. LM Studio, llama.cpp server and AMD Lemonade are detected automatically too.
      {ollama?.error ? <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>{ollama.error}</div> : null}
    </Empty></>);

  return (<>
    <div className="eyebrow">Lab</div><h1>Test a model on this laptop</h1>
    <div className="card" style={{ marginBottom: 16 }}><div className="grid g3" style={{ alignItems: "end" }}>
      <label className="f">Server<select value={rtId} onChange={(e) => setRtId(e.target.value)}>{online.map((r) => <option key={r.id} value={r.id}>{r.name} {r.version ? `v${r.version}` : ""}</option>)}</select></label>
      <label className="f">Model<select value={model} onChange={(e) => setModel(e.target.value)}>{models.length ? models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.sizeGiB ? ` · ${m.sizeGiB.toFixed(1)} GB` : ""}</option>) : <option value="">No models installed</option>}</select></label>
      <div className="row"><button className="btn primary" disabled={!model || !!busy} onClick={runBench}>Run benchmark</button>{busy ? <button className="btn" onClick={() => { void (busy === "bench" ? api.invoke("bench:cancel") : api.invoke("chat:stop", busy)); }}><Square size={14} />Stop</button> : null}</div>
    </div>
    {loadErr ? <div className="flag bad" style={{ marginTop: 12 }}>{loadErr}</div> : null}
    {runtimes.find((r) => r.id === rtId)?.kind === "ollama" ? <div className="row" style={{ marginTop: 14, flexWrap: "nowrap" }}><input placeholder="Download a model, e.g. llama3.2:3b" value={pullName} onChange={(e) => setPullName(e.target.value)} /><button className="btn" disabled={!pullName || !!pull} onClick={async () => { try { setPull("starting"); await api.invoke("pull:start", { runtimeId: rtId, model: pullName }); } catch (e) { setPull(`⚠ ${(e as Error).message}`); } }}><Download size={14} />Download</button></div> : null}
    {pull ? <div className="dim" style={{ marginTop: 8 }}>{pull}</div> : null}
    {!models.length && !loadErr ? <div className="muted" style={{ marginTop: 12 }}>No models installed yet. Download one above, or use the Best for this laptop page to choose.</div> : null}
    </div>
    {bench ? <div className="card" style={{ marginBottom: 16 }}><div className="row between"><b>{bench.step}</b><span className="dim">{Math.round(bench.frac * 100)}%</span></div><div className="bar" style={{ marginTop: 10 }}><i className="red" style={{ width: `${bench.frac * 100}%` }} /></div></div> : null}
    {benchErr ? <div className="flag bad" style={{ marginBottom: 16 }}>{benchErr}</div> : null}
    {last ? <BenchCard r={last} /> : null}
    <div className="chat">
      <div className="msgs" aria-live="polite">
        {!msgs.length ? <div className="dim" style={{ margin: "auto" }}>Say something to {sel?.name ?? "the model"}. Speed is shown under each reply.</div> : null}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div className={`msg ${m.role}`}>
              {m.role === "assistant" ? <FormattedMessage text={m.content} /> : (m.content || "…")}
            </div>
            {m.stats?.decodeTokS ? (
              <div className="dim mono" style={{ fontSize: 12, marginTop: 4 }}>
                {fmt(m.stats.decodeTokS)} tok/s · {m.stats.tokens} tokens{m.stats.ttftS ? ` · first token ${fmt(m.stats.ttftS, 2)}s` : ""}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="row" style={{ marginTop: 12, flexWrap: "nowrap" }}>
        <textarea rows={2} placeholder="Message" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className="btn primary" disabled={!input.trim() || !!busy || !model} onClick={send}><Send size={16} />Send</button>
        <button className="btn ghost" onClick={() => setMsgs([])} disabled={!msgs.length || !!busy}>Clear</button>
      </div>
    </div>
    {machine ? null : null}
  </>);
}

function BenchCard({ r }: { r: BenchResult }) {
  const p = r.predicted;
  const inside = p && r.decodeTokS ? r.decodeTokS >= p.lo * 0.9 && r.decodeTokS <= p.hi * 1.1 : null;
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
      <div className="grid g4">
        <div className="stat"><div className="k">Generation</div><div className="v">{fmt(r.decodeTokS)} <small className="muted">tok/s</small></div><div className="s">median of {r.decodeRuns.length} runs</div></div>
        <div className="stat"><div className="k">Prompt processing</div><div className="v">{fmt(r.prefillTokS, 0)} <small className="muted">tok/s</small></div></div>
        <div className="stat"><div className="k">On GPU</div><div className="v">{r.placement.gpuFraction == null ? "Unknown" : `${Math.round(r.placement.gpuFraction * 100)}%`}</div></div>
        <div className="stat"><div className="k">Predicted</div><div className="v">{p ? `${fmt(p.lo, 0)}–${fmt(p.hi, 0)}` : "–"}</div><div className="s">{inside == null ? "" : inside ? "Within the predicted range" : "Outside the range: predictions now use your number"}</div></div>
      </div>
      {r.notes.map((n) => <div key={n} className="flag warn" style={{ marginTop: 10 }}>{n}</div>)}
    </div>
  );
}
