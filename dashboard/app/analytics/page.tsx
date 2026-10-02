"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Database, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { BenchmarkRecord } from "@/lib/types";
import { MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

export default function AnalyticsPage() {
  const [rows, setRows] = useState<BenchmarkRecord[]>([]);
  const [evaluation, setEvaluation] = useState<Record<string, string | number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([api.benchmarks(new URLSearchParams({ limit: "1000" })), api.evaluation()])
      .then(([data, metrics]) => { setRows(data); setEvaluation(metrics); })
      .catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);
  const coverage = useMemo(() => ({
    models: new Set(rows.map((row) => row.model)).size,
    configurations: new Set(rows.map((row) => `${row.precision}|${row.quantization}|${row.backend}`)).size,
    contexts: new Set(rows.map((row) => row.context_tokens)).size,
  }), [rows]);
  const scatter = rows.filter((row) => row.generation_tok_s != null).map((row) => ({ parameters_b: row.parameters_b, speed: row.generation_tok_s as number, model: row.model, precision: row.precision, context: row.context_tokens }));
  const format = (key: string, digits = 2) => typeof evaluation?.[key] === "number" ? (evaluation[key] as number).toFixed(digits) : "n/a";
  return <>
    <PageHeader eyebrow="Analysis / validation and data coverage" title="Analytics" detail="Inspect measured data coverage and model validation metrics. Estimates remain distinct from the held-out benchmark evidence." action={<span className="inline-flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)]"><ShieldCheck size={13} />Leave-one-model-out</span>} />
    <MessageState loading={loading} error={error} />
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4"><StatTile label="Measured observations" value={String(rows.length)} note="Source dataset rows" tone="green" /><StatTile label="Model sizes" value={String(coverage.models)} note="Unique observed models" tone="blue" /><StatTile label="Observed stacks" value={String(coverage.configurations)} note="Precision / quantization / backend" tone="amber" /><StatTile label="Context values" value={String(coverage.contexts)} note="Observed token lengths" tone="red" /></div>
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="Observed scaling" detail="Measured generation rate by parameter count. Each point is an empirical observation."><div className="h-[320px]" role="img" aria-label="Measured throughput versus model size scatter plot"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 18, bottom: 6, left: 2 }}><CartesianGrid className="chart-grid" vertical={false} /><XAxis type="number" dataKey="parameters_b" name="Parameters (B)" tickLine={false} axisLine={false} className="chart-axis" /><YAxis type="number" dataKey="speed" name="Generation (tok/s)" tickLine={false} axisLine={false} className="chart-axis" /><Tooltip contentStyle={{ borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : value, name]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.model} · ${payload[0].payload.precision} · ${payload[0].payload.context} tokens` : ""} /><Scatter data={scatter} fill="#58c7a5" fillOpacity={0.72} /></ScatterChart></ResponsiveContainer></div></Panel>
      <Panel title="Held-out model validation" detail="Saved evaluation metrics; validation method is leave-one-model-out. These are aggregate errors, not per-prediction intervals."><MessageState loading={loading} empty={!loading && !evaluation ? "Evaluation metrics unavailable." : undefined} /><div className="grid gap-2">{[["VRAM MAE", `${format("vram_mae_gb")} GB`], ["VRAM R²", format("vram_r2")], ["Throughput MAE", `${format("throughput_mae_tok_s")} tok/s`], ["Throughput R²", format("throughput_r2")], ["Validation", String(evaluation?.method ?? "n/a")]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded border border-[var(--line)] bg-[#111715] px-3 py-3"><span className="text-[11px] text-[var(--muted)]">{label}</span><span className="text-xs font-semibold tabular-nums">{value}</span></div>)}</div></Panel>
    </div>
    <Panel title="Evidence coverage" detail="Breadth of empirical support for the current model artifacts." className="mt-4"><div className="grid gap-4 sm:grid-cols-3"><div className="flex gap-3"><Database size={15} className="mt-0.5 text-[var(--green)]" /><div><p className="text-xs font-semibold">{rows.length} benchmark rows</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Raw measured data remains unmodified. Estimates point back to this source distribution.</p></div></div><div className="flex gap-3"><Activity size={15} className="mt-0.5 text-[var(--blue)]" /><div><p className="text-xs font-semibold">{coverage.configurations} observed stacks</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Unseen combinations are model-based estimates, optionally context-calibrated against nearby rows.</p></div></div><div className="flex gap-3"><ShieldCheck size={15} className="mt-0.5 text-[var(--amber)]" /><div><p className="text-xs font-semibold">Confidence is evidence coverage</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Coverage reflects nearby model, precision, backend, and context observations. It is not a probability guarantee.</p></div></div></div></Panel>
  </>;
}
