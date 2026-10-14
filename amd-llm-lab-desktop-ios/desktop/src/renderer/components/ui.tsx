import type { ReactNode } from "react";
import { levelLabel } from "../../core/decide";
import { fmtGiB, fmtRange } from "../../core/format";
import type { Flag, Level, MemoryBar, Plan, SpeedBasis, Verdict } from "../../shared/types";

export const LevelPill = ({ level }: { level: Level }) => <span className={`pill ${level}`}>{levelLabel(level)}</span>;

export const Stat = ({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) => (
  <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s ? <div className="s">{s}</div> : null}</div>
);

const BASIS: Record<SpeedBasis, string> = {
  calibrated: "From your own benchmark", "measured-memory": "From a memory test on this laptop", spec: "From published GPU specs", guess: "Rough guess: hardware not recognised",
};
export const basisText = (b: SpeedBasis) => BASIS[b];

export function Speed({ plan, big = true }: { plan: Plan | null; big?: boolean }) {
  if (!plan?.speed) return <span className="muted">No estimate</span>;
  return (
    <div>
      <div className="speed" style={big ? undefined : { fontSize: 24 }}>{fmtRange(plan.speed.lo, plan.speed.hi)}<small>tok/s</small></div>
      <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{BASIS[plan.basis]}</div>
    </div>
  );
}

export function Bars({ bars, total }: { bars: MemoryBar[]; total: number }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      {bars.map((b) => {
        const pct = Math.min(100, (b.usedGiB / Math.max(0.01, b.capacityGiB)) * 100);
        const freed = Math.min(100, (b.freedCapacityGiB / Math.max(0.01, b.capacityGiB)) * 100);
        const over = b.usedGiB > b.capacityGiB;
        return (
          <div key={b.label}>
            <div className="row between" style={{ fontSize: 13, marginBottom: 6 }}>
              <span className="muted">{b.label}</span>
              <span className={over ? "" : "dim"} style={over ? { color: "var(--red)" } : undefined}>{fmtGiB(b.usedGiB)} of {fmtGiB(b.capacityGiB)}</span>
            </div>
            <div className="bar" role="img" aria-label={`${b.label}: ${fmtGiB(b.usedGiB)} used of ${fmtGiB(b.capacityGiB)}`}>
              <i className={over ? "red" : pct > 85 ? "warn" : ""} style={{ width: `${pct}%` }} />
              {b.freedCapacityGiB > b.capacityGiB ? null : <u style={{ left: `${freed}%` }} title="Memory available if you close other apps" />}
            </div>
          </div>
        );
      })}
      <div className="dim" style={{ fontSize: 12 }}>Needs {fmtGiB(total)} in total. The red mark shows what you could free by closing other apps.</div>
    </div>
  );
}

export const Flags = ({ flags }: { flags: Flag[] }) => (
  <div className="stack" style={{ gap: 8 }}>{flags.map((f) => <div key={f.code + f.text} className={`flag ${f.severity}`}>{f.text}</div>)}</div>
);

export function VerdictBody({ v }: { v: Verdict }) {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between"><LevelPill level={v.level} /><span className="dim mono">{v.quant} · {v.ctx.toLocaleString()} ctx</span></div>
      <Speed plan={v.plan} />
      <p style={{ margin: 0 }}>{v.headline}</p>
      <Bars bars={v.bars} total={v.memory.totalGiB} />
      {v.flags.length ? <Flags flags={v.flags} /> : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2><div style={{ marginBottom: action ? 16 : 0 }}>{children}</div>{action}</div>;
}
export const Skeleton = ({ n = 3 }: { n?: number }) => <div className="stack">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" />)}</div>;
export const useCtxOptions = () => [2048, 4096, 8192, 16384, 32768];
export function CtxSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="f">Context window
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[2048, 4096, 8192, 16384, 32768, 65536].map((c) => <option key={c} value={c}>{c.toLocaleString()} tokens</option>)}
      </select>
    </label>
  );
}
