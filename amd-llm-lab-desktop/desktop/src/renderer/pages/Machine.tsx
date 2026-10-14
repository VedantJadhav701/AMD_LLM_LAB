import { useState } from "react";
import { fmtGiB } from "../../core/format";
import type { MachineOverrides } from "../../shared/types";
import { Flags, Stat } from "../components/ui";
import { api, useApp } from "../state";

export function MachinePage() {
  const { machine, rescan, scanning, settings, saveSettings, calibration, setCalibration } = useApp();
  const o = settings?.overrides ?? {};
  const [draft, setDraft] = useState<{ vram: string; bw: string; ram: string; cpu: boolean }>({ vram: String(o.vramGiB ?? ""), bw: String(o.bandwidthGBps ?? ""), ram: String(o.ramAvailableGiB ?? ""), cpu: !!o.forceCpuOnly });
  const [saved, setSaved] = useState(false);
  if (!machine) return <><h1>My machine</h1><div className="muted">Scanning…</div></>;
  const num = (s: string) => { const n = Number(s); return s.trim() && Number.isFinite(n) && n > 0 ? n : null; };
  async function save() {
    const ov: MachineOverrides = { vramGiB: num(draft.vram), bandwidthGBps: num(draft.bw), ramAvailableGiB: num(draft.ram), forceCpuOnly: draft.cpu || undefined };
    await saveSettings({ overrides: ov }); setSaved(true); setTimeout(() => setSaved(false), 1800);
  }
  return (<>
    <div className="eyebrow">My machine</div><h1>What the app found</h1>
    <p className="lead">Detected locally. If something looks wrong, correct it below and every prediction updates.</p>
    <div className="grid g4 card" style={{ marginBottom: 16 }}>
      <Stat k="Processor" v={<span style={{ fontSize: 18 }}>{machine.cpu.name}</span>} s={`${machine.cpu.physicalCores ?? "?"} cores / ${machine.cpu.logicalCores} threads`} />
      <Stat k="Memory" v={fmtGiB(machine.ram.totalGiB)} s={`${fmtGiB(machine.ram.availableGiB)} free now${machine.ram.type ? ` · ${machine.ram.type}` : ""}`} />
      <Stat k="Memory read speed" v={machine.memProbe ? `${machine.memProbe.readGBps.toFixed(0)} GB/s` : "–"} s="Quick test on this laptop" />
      <Stat k="System" v={<span style={{ fontSize: 18 }}>{machine.osVersion}</span>} s={`${machine.arch}${machine.power.onBattery ? " · on battery" : ""}${machine.rosetta ? " · Rosetta" : ""}`} />
    </div>
    <h2>Graphics</h2>
    <div className="stack" style={{ marginBottom: 16 }}>
      {machine.gpus.length === 0 ? <div className="card muted">No GPU detected. Models will run on the CPU.</div> : machine.gpus.map((g) => (
        <div className="card" key={g.id}><div className="grid g4">
          <Stat k="GPU" v={<span style={{ fontSize: 18 }}>{g.name}</span>} s={g.kind === "apple" ? "Unified memory" : g.kind} />
          <Stat k="Memory" v={g.dedicatedGiB ? fmtGiB(g.dedicatedGiB) : g.sharedGiB ? `${fmtGiB(g.sharedGiB)} shared` : "Unknown"} />
          <Stat k="Bandwidth" v={g.bandwidthGBps ? `${g.bandwidthGBps} GB/s` : "Unknown"} s={g.bandwidthSource === "spec" ? "Published spec" : g.bandwidthSource === "guess" ? "Estimated" : ""} />
          <Stat k="Used by local runtimes" v={{ yes: "Yes", likely: "Likely", maybe: "Maybe", no: "No" }[g.accel]} s={g.driver ? `Driver ${g.driver}` : undefined} />
        </div></div>))}
    </div>
    {machine.notes.length ? <Flags flags={machine.notes.map((t) => ({ severity: "info" as const, code: t, text: t }))} /> : null}
    <h2 style={{ marginTop: 28 }}>Correct the detection</h2>
    <div className="card"><div className="grid g3">
      <label className="f">GPU memory (GB)<input inputMode="decimal" value={draft.vram} placeholder="auto" onChange={(e) => setDraft({ ...draft, vram: e.target.value })} /></label>
      <label className="f">GPU bandwidth (GB/s)<input inputMode="decimal" value={draft.bw} placeholder="auto" onChange={(e) => setDraft({ ...draft, bw: e.target.value })} /></label>
      <label className="f">Free RAM to assume (GB)<input inputMode="decimal" value={draft.ram} placeholder="auto" onChange={(e) => setDraft({ ...draft, ram: e.target.value })} /></label>
    </div>
      <label className="row" style={{ marginTop: 14 }}><input type="checkbox" style={{ width: 18 }} checked={draft.cpu} onChange={(e) => setDraft({ ...draft, cpu: e.target.checked })} /> My runtime does not use the GPU (CPU only)</label>
      <div className="row" style={{ marginTop: 16 }}><button className="btn primary" onClick={save}>Save</button><button className="btn" disabled={scanning} onClick={rescan}>{scanning ? "Scanning…" : "Scan again"}</button>{saved ? <span className="muted">Saved</span> : null}</div>
    </div>
    <h2 style={{ marginTop: 28 }}>Your benchmarks</h2>
    <div className="card">
      {calibration.gpu || calibration.cpu ? <div className="stack">
        {([["GPU", calibration.gpu], ["CPU", calibration.cpu]] as const).map(([n, c]) => c ? <div key={n} className="row between"><span><b>{n}</b> · {c.model} · {c.measuredTokS.toFixed(1)} tok/s</span><span className="dim mono">{c.effGBps.toFixed(0)} GB/s effective</span></div> : null)}
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={async () => { await api.invoke("calibration:clear"); setCalibration({}); }}>Forget benchmarks</button>
      </div> : <span className="muted">None yet. Run a benchmark in the Lab and predictions become specific to this laptop.</span>}
    </div>
  </>);
}
