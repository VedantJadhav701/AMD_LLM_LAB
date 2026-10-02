import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

export function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase text-[var(--red)]">{eyebrow}</p>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, detail, action, children, className = "" }: { title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface)] ${className}`}>
      <div className="flex min-h-[60px] items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
          {detail && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, suffix, note, tone = "red" }: { label: string; value: string; suffix?: string; note: string; tone?: "red" | "green" | "blue" | "amber" }) {
  const colors = { red: "border-t-[var(--red)]", green: "border-t-[var(--green)]", blue: "border-t-[var(--blue)]", amber: "border-t-[var(--amber)]" };
  return (
    <div className={`min-w-0 rounded-md border border-[var(--line)] border-t-[3px] bg-[var(--surface)] px-4 py-3 ${colors[tone]}`}>
      <p className="truncate text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5 text-[25px] font-semibold leading-none tabular-nums text-[var(--ink)]">
        {value}{suffix && <span className="text-xs font-medium text-[var(--muted)]">{suffix}</span>}
      </p>
      <p className="mt-2 truncate text-[11px] text-[var(--muted)]">{note}</p>
    </div>
  );
}

export function FieldSelect({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded border border-[var(--line)] bg-[#111715] px-3 text-sm text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] disabled:bg-[#1c2422]">
        {options.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function FieldNumber({ label, value, onChange, min = 0, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">{label}</span>
      <span className="relative block">
        <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded border border-[var(--line)] bg-[#111715] px-3 pr-12 text-sm tabular-nums text-[var(--ink)] shadow-sm outline-none focus:border-[var(--blue)]" />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">{suffix}</span>}
      </span>
    </label>
  );
}

export function MessageState({ loading, error, empty }: { loading?: boolean; error?: string | null; empty?: string }) {
  if (loading) return <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin" />Loading measurements</div>;
  if (error) return <div role="alert" className="flex min-h-28 items-start gap-2 rounded border border-[#643238] bg-[#2a1c1d] p-3 text-sm text-[#ff8589]"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>;
  if (empty) return <div className="flex min-h-28 items-center justify-center text-sm text-[var(--muted)]">{empty}</div>;
  return null;
}

export function formatModel(model: string) {
  return model.split("/").pop()?.replace("-Instruct", "") ?? model;
}

export function formatMetric(value: number | null | undefined, digits = 1) {
  return value == null ? "n/a" : value.toFixed(digits);
}
