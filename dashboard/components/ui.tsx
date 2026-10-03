import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Cpu, LoaderCircle, XCircle } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-[var(--line)] pb-7">
      <div>
        <p className="mb-3 text-[13px] font-medium text-[var(--cyan)]">{eyebrow}</p>
        <h1 className="display text-[38px] font-semibold leading-[1.02] tracking-tight text-[var(--ink)] sm:text-[52px]">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[var(--muted)]">{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  detail,
  action,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 border border-[var(--line)] bg-[var(--surface)] ${className}`}>
      <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
          {detail && <p className="mt-0.5 text-xs text-[var(--muted)]">{detail}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  suffix,
  note,
  tone = "red",
}: {
  label: string;
  value: string;
  suffix?: string;
  note: string;
  tone?: "red" | "green" | "blue" | "amber";
}) {
  // "red" is kept as the default tone name for existing callers; it now renders AMD cyan.
  const colors = {
    red: "border-l-[var(--cyan)]",
    green: "border-l-[#10b981]",
    blue: "border-l-[#38bdf8]",
    amber: "border-l-[#f59e0b]",
  };
  return (
    <div className={`min-w-0 border border-[var(--line)] border-l-[3px] bg-[var(--surface)] px-5 py-4 ${colors[tone]}`}>
      <p className="truncate text-[13px] text-[var(--muted)]">{label}</p>
      <p className="display mt-3 flex items-baseline gap-2 text-[40px] font-semibold leading-none tabular-nums text-[var(--ink)]">
        {value}
        {suffix && <span className="text-sm font-normal text-[var(--muted)]">{suffix}</span>}
      </p>
      <p className="mt-3 truncate text-xs text-[var(--muted)]">{note}</p>
    </div>
  );
}

export function ProvenanceBadge({ type }: { type: "measured" | "estimated" | "interpolated" | string }) {
  const normalized = type.toLowerCase();
  if (normalized === "measured") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[var(--cyan)] px-2 py-0.5 text-[11px] font-semibold text-[var(--cyan)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
        Measured
      </span>
    );
  }
  if (normalized === "interpolated") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[#b45309] px-2 py-0.5 text-[11px] font-semibold text-[#fbbf24]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" />
        Interpolated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#4b5057] px-2 py-0.5 text-[11px] font-semibold text-[#aab0b6]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#aab0b6]" />
      Estimated
    </span>
  );
}

export type DeviceFeasibilityCategory = "GPU FIT" | "GPU TIGHT" | "OFFLOADABLE" | "NOT PRACTICAL";

export function FeasibilityBadge({ category }: { category: DeviceFeasibilityCategory }) {
  switch (category) {
    case "GPU FIT":
      return (
        <span className="inline-flex items-center gap-1.5 border border-[#059669] bg-[#052e22] px-2 py-0.5 text-[11px] font-semibold text-[#34d399]">
          <CheckCircle2 size={13} className="shrink-0" />
          GPU fit
        </span>
      );
    case "GPU TIGHT":
      return (
        <span className="inline-flex items-center gap-1.5 border border-[#d97706] bg-[#2e1704] px-2 py-0.5 text-[11px] font-semibold text-[#fbbf24]">
          <AlertTriangle size={13} className="shrink-0" />
          GPU tight
        </span>
      );
    case "OFFLOADABLE":
      return (
        <span className="inline-flex items-center gap-1.5 border border-[var(--cyan)] bg-[#03232a] px-2 py-0.5 text-[11px] font-semibold text-[var(--cyan)]">
          <Cpu size={13} className="shrink-0" />
          Offloadable
        </span>
      );
    case "NOT PRACTICAL":
      return (
        <span className="inline-flex items-center gap-1.5 border border-[#dc2626] bg-[#2d0a0a] px-2 py-0.5 text-[11px] font-semibold text-[#f87171]">
          <XCircle size={13} className="shrink-0" />
          Not practical
        </span>
      );
  }
}

export function FieldSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-[13px] text-[var(--muted)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--cyan)] disabled:bg-[#1a1a1a]"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FieldNumber({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-[13px] text-[var(--muted)]">{label}</span>
      <span className="relative block">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 w-full border border-[var(--line)] bg-[var(--surface-2)] px-3 pr-12 text-sm tabular-nums text-[var(--ink)] outline-none focus:border-[var(--cyan)]"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

export function MessageState({
  loading,
  error,
  empty,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: string;
}) {
  if (loading)
    return (
      <div className="flex min-h-36 items-center justify-center gap-3 text-sm text-[var(--muted)]">
        <LoaderCircle size={18} className="animate-spin text-[var(--cyan)]" />
        Loading benchmark data…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="flex min-h-24 items-start gap-3 border border-[#7f1d1d] bg-[#240a0a] p-4 text-sm text-[#fca5a5]">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#ef4444]" />
        <div>
          <p className="font-semibold text-[#ef4444]">Can’t reach the API</p>
          <p className="mt-1 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  if (empty)
    return <div className="flex min-h-28 items-center justify-center text-sm text-[var(--muted)]">{empty}</div>;
  return null;
}

export function formatModel(model: string) {
  return model.split("/").pop()?.replace("-Instruct", "") ?? model;
}

export function formatMetric(value: number | null | undefined, digits = 1) {
  return value == null ? "n/a" : value.toFixed(digits);
}
