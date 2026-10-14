import { useEffect, useState } from "react";
import { fmtGiB } from "../../core/format";
import type { Goal, Recommendation } from "../../shared/types";
import { Empty, LevelPill, Skeleton, Speed, CtxSelect, Flags } from "../components/ui";
import { api, useApp } from "../state";

export function Overview() {
  const { machine, scanning, machineError, rescan, settings, go, rev, calibration } = useApp();
  const [goal, setGoal] = useState<Goal>("quality");
  const [ctx, setCtx] = useState<number | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const c = ctx ?? settings?.defaultCtx ?? 4096;

  useEffect(() => {
    if (!machine) return; let live = true; setRecs(null); setErr(null);
    api.invoke("decide:recommend", { goal, ctx: c }).then((r) => live && setRecs(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [machine, goal, c, rev]);

  const g = machine?.gpus[0];
  const pool = machine ? (machine.unified ? `${fmtGiB(machine.ram.totalGiB)} unified` : g?.dedicatedGiB ? `${fmtGiB(g.dedicatedGiB)} VRAM` : `${fmtGiB(machine.ram.availableGiB)} free RAM`) : "";
  return (
    <>
      <div className="eyebrow">Best for this laptop</div>
      <h1>What can this laptop really run?</h1>
      <p className="lead">The models below are ranked by how well they will work on your hardware: whether they fit in memory, and how fast they will generate. Run a short benchmark in the Lab and the speeds become your own measured numbers.</p>
      {machineError ? <Empty title="Could not read this computer" action={<button className="btn primary" onClick={rescan}>Try again</button>}>{machineError}</Empty> : null}
      {scanning && !machine ? <Skeleton n={2} /> : null}
      {machine ? (
        <div className="hero">
          <div className="grid g4">
            <div className="stat"><div className="k">Processor</div><div className="v" style={{ fontSize: 20 }}>{machine.cpu.name.replace(/\(R\)|\(TM\)/g, "")}</div><div className="s">{machine.cpu.logicalCores} threads</div></div>
            <div className="stat"><div className="k">Graphics</div><div className="v" style={{ fontSize: 20 }}>{g ? g.name.replace(/\(R\)|\(TM\)/g, "") : "No dedicated GPU found"}</div><div className="s">{pool}</div></div>
            <div className="stat"><div className="k">Memory</div><div className="v">{fmtGiB(machine.ram.totalGiB)}</div><div className="s">{fmtGiB(machine.ram.availableGiB)} free now</div></div>
            <div className="stat"><div className="k">Predictions</div><div className="v" style={{ fontSize: 20 }}>{calibration.gpu || calibration.cpu ? "Calibrated" : "Estimated"}</div><div className="s">{calibration.gpu || calibration.cpu ? "Using your benchmark" : "Run a benchmark to tighten them"}</div></div>
          </div>
          {machine.notes.length ? <div style={{ marginTop: 16 }}><Flags flags={machine.notes.map((t) => ({ severity: "info" as const, code: t, text: t }))} /></div> : null}
        </div>
      ) : null}
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="seg" role="group" aria-label="Goal">{(["quality", "speed", "context"] as Goal[]).map((x) => <button key={x} className={goal === x ? "on" : ""} onClick={() => setGoal(x)}>{x === "quality" ? "Best quality" : x === "speed" ? "Fastest" : "Longest context"}</button>)}</div>
        <div style={{ width: 200 }}><CtxSelect value={c} onChange={setCtx} /></div>
      </div>
      {err ? <Empty title="Something went wrong">{err}</Empty> : null}
      {machine && !recs && !err ? <Skeleton /> : null}
      {recs && recs.length === 0 ? <Empty title="Nothing in the catalog fits">Nothing in the catalog fits in the memory available right now. Close other apps or lower the context window.</Empty> : null}
      <div className="stack">
        {recs?.map((r) => (
          <div className="card" key={r.model.id}>
            <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1.2fr auto", alignItems: "center" }}>
              <div>
                <div className="row" style={{ gap: 10 }}><h2 style={{ margin: 0 }}>{r.model.name}</h2><LevelPill level={r.verdict.level} /></div>
                <div className="dim mono" style={{ marginTop: 4 }}>{r.model.activeParamsB ? `${r.model.paramsB}B total, ${r.model.activeParamsB}B active` : `${r.model.paramsB}B`} · {r.verdict.quant} · {fmtGiB(r.verdict.fileGiB)}</div>
              </div>
              <Speed plan={r.verdict.plan} big={false} />
              <div className="muted" style={{ fontSize: 14 }}>{r.verdict.headline}</div>
              <div className="stack" style={{ gap: 8 }}>
                <button className="btn primary sm" onClick={() => go("lab", { catalogId: r.model.id })}>Test it</button>
                <button className="btn sm" onClick={() => go("canrun", { modelId: r.model.id })}>Details</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
