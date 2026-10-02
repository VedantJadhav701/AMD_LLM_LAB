"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Database } from "lucide-react";
import { api } from "@/lib/api";
import type { BenchmarkRecord } from "@/lib/types";
import { MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

export default function QuantizationPage() {
  const [records, setRecords] = useState<BenchmarkRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.benchmarks(new URLSearchParams({ limit: "1000" })).then(setRecords).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, []);
  const summary = useMemo(() => {
    const values = new Map<string, { precision: string; count: number; vram: number[]; speed: number[]; models: Set<string> }>();
    records.forEach((row) => {
      const value = values.get(row.precision) ?? { precision: row.precision, count: 0, vram: [], speed: [], models: new Set<string>() };
      value.count += 1; value.vram.push(row.peak_vram_gb); if (row.generation_tok_s != null) value.speed.push(row.generation_tok_s); value.models.add(row.model); values.set(row.precision, value);
    });
    return [...values.values()].map((value) => ({ precision: value.precision, count: value.count, models: value.models.size, avg_vram: value.vram.reduce((sum, v) => sum + v, 0) / value.vram.length, avg_speed: value.speed.length ? value.speed.reduce((sum, v) => sum + v, 0) / value.speed.length : 0 }));
  }, [records]);
  const int4 = summary.find((row) => row.precision === "INT4");
  const bf16 = summary.find((row) => row.precision === "BF16");
  return <>
    <PageHeader eyebrow="Analysis / measured comparisons" title="Quantization analysis" detail="Compare memory and generation behavior by precision using only the measured MI300X benchmark rows." action={<span className="inline-flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)]"><Database size={13} />Empirical only</span>} />
    {error && <MessageState error={error} />}
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4"><StatTile label="Measured INT4" value={String(int4?.count ?? 0)} note="Source rows" tone="green" /><StatTile label="INT4 average VRAM" value={int4?.avg_vram.toFixed(1) ?? "n/a"} suffix="GB" note="Measured peak memory" tone="blue" /><StatTile label="INT4 average speed" value={int4?.avg_speed.toFixed(1) ?? "n/a"} suffix="tok/s" note="Measured generation rate" tone="amber" /><StatTile label="Precision categories" value={String(summary.length)} note="Across 57 benchmark rows" tone="red" /></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Peak VRAM by precision" detail="Mean measured peak memory. Different models/backends contribute to each precision group."><MessageState loading={loading} empty={!loading && !error && !summary.length ? "No measured comparisons available." : undefined} /><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary} margin={{ top: 12, right: 10, left: -15, bottom: 5 }}><CartesianGrid className="chart-grid" vertical={false} /><XAxis dataKey="precision" tickLine={false} axisLine={false} className="chart-axis" /><YAxis tickLine={false} axisLine={false} className="chart-axis" /><Tooltip contentStyle={{ borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} /><Bar dataKey="avg_vram" name="Mean peak VRAM (GB)" fill="#61b6d5" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Generation throughput by precision" detail="Mean measured generation throughput; no synthetic points are included."><MessageState loading={loading} /><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary} margin={{ top: 12, right: 10, left: -15, bottom: 5 }}><CartesianGrid className="chart-grid" vertical={false} /><XAxis dataKey="precision" tickLine={false} axisLine={false} className="chart-axis" /><YAxis tickLine={false} axisLine={false} className="chart-axis" /><Tooltip contentStyle={{ borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} /><Bar dataKey="avg_speed" name="Mean generation (tok/s)" fill="#58c7a5" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
    </div>
    <Panel title="Measured precision groups" detail="Aggregates are descriptive, not causal: model sizes and backend mix vary by precision." className="mt-4"><MessageState loading={loading} /><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-wide text-[var(--muted)]"><th className="py-3">Precision</th><th>Rows</th><th>Models</th><th>Mean VRAM</th><th>Mean tok/s</th><th>Comparison</th></tr></thead><tbody>{summary.map((row) => <tr key={row.precision} className="border-b border-[var(--line)] last:border-0"><td className="py-3 font-semibold">{row.precision}</td><td className="tabular-nums">{row.count}</td><td className="tabular-nums">{row.models}</td><td className="tabular-nums">{row.avg_vram.toFixed(2)} GB</td><td className="tabular-nums">{row.avg_speed.toFixed(2)} tok/s</td><td className="text-[var(--muted)]">{int4 && row.precision !== "INT4" ? <span className="inline-flex items-center gap-1">{int4.avg_vram < row.avg_vram ? <ArrowDownRight size={13} className="text-[var(--green)]" /> : <ArrowUpRight size={13} className="text-[var(--amber)]" />}{Math.abs((int4.avg_vram / row.avg_vram - 1) * 100).toFixed(1)}% INT4 mean VRAM difference</span> : "Reference"}</td></tr>)}</tbody></table></div><p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">{bf16 ? `BF16 and INT4 each include different model/backend coverage (BF16: ${bf16.models} models, INT4: ${int4?.models ?? 0} models).` : "Coverage is limited to observed benchmark combinations."} Values are measured aggregates from amd_llm_lab_master.csv.</p></Panel>
  </>;
}
