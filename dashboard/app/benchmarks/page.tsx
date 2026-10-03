"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api, modelLabel } from "@/lib/api";
import type { ApiConfiguration, BenchmarkRecord, ModelInfo, RecommendationRow } from "@/lib/types";
import { FieldSelect, formatMetric, formatModel, MessageState, PageHeader, Panel } from "@/components/ui";

const metrics = [
  { key: "vram", label: "VRAM", field: "peak_vram_gb", unit: "GB", color: "#397c9a" },
  { key: "throughput", label: "Throughput", field: "generation_tok_s", unit: "tok/s", color: "#137c67" },
  { key: "latency", label: "Latency", field: "latency_s", unit: "s", color: "#d62932" },
  { key: "tokens", label: "Tokens/GB", field: "tokens_per_gb", unit: "tok/GB", color: "#b17a23" },
] as const;

type Filters = { model: string; parameters_b: string; precision: string; quantization: string; backend: string; context: string };
const emptyFilters: Filters = { model: "", parameters_b: "", precision: "", quantization: "", backend: "", context: "" };

export default function BenchmarksPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [configurations, setConfigurations] = useState<ApiConfiguration[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [queryKey, setQueryKey] = useState("limit=1000");
  const [records, setRecords] = useState<BenchmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<(typeof metrics)[number]["key"]>("vram");
  const [xAxis, setXAxis] = useState<"parameters_b" | "context_tokens">("parameters_b");
  const [estimates, setEstimates] = useState<RecommendationRow[]>([]);
  const [benchmarkVram, setBenchmarkVram] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.models(), api.metadata(), api.hardware()])
      .then(([modelData, metadata, hardware]) => {
        setModels(modelData);
        setConfigurations(metadata.recommender_metadata.configurations);
        setBenchmarkVram(hardware.vram_gb);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const benchmarkContext = models[0]?.context_lengths[0];
    if (benchmarkVram == null || benchmarkContext == null) return;
    api.recommend({ available_vram_gb: benchmarkVram, minimum_throughput_tok_s: 0, context_tokens: benchmarkContext, objective: "balanced" })
      .then((result) => setEstimates(result.candidate_configurations.filter((row) => row.source_type !== "measured")))
      .catch(() => setEstimates([]));
  }, [benchmarkVram, models]);

  useEffect(() => {
    api.benchmarks(new URLSearchParams(queryKey))
      .then(setRecords)
      .catch((reason: Error) => { setRecords([]); setError(reason.message); })
      .finally(() => setLoading(false));
  }, [queryKey]);

  const parameterOptions = useMemo(() => models.map((model) => ({ value: String(model.parameters_b), label: `${modelLabel(model.model, model.parameters_b)}B` })), [models]);
  const contextOptions = useMemo(() => [...new Set(models.flatMap((model) => model.context_lengths))].sort((a, b) => a - b).map((value) => ({ value: String(value), label: `${value.toLocaleString()} tokens` })), [models]);
  const precisionOptions = [...new Set(configurations.map((item) => item.precision))].map((value) => ({ value, label: value }));
  const quantizationOptions = [...new Set(configurations.map((item) => item.quantization))].map((value) => ({ value, label: value }));
  const backendOptions = [...new Set(configurations.map((item) => item.backend))].map((value) => ({ value, label: value }));
  const activeMetric = metrics.find((metric) => metric.key === metricKey) ?? metrics[0];
  const chartData = records.filter((row) => row[activeMetric.field] != null).map((row) => ({
    x: row[xAxis],
    y: row[activeMetric.field] as number,
    model: formatModel(row.model),
    precision: row.precision,
    context: row.context_tokens,
  }));

  function setFilter(field: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function applyFilters() {
    const query = new URLSearchParams({ limit: "1000" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    setLoading(true);
    setError(null);
    setQueryKey(query.toString());
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setLoading(true);
    setError(null);
    setQueryKey("limit=1000");
  }

  return (
    <>
      <PageHeader eyebrow="Measured data + model estimates" title="Benchmark explorer" detail="The measured view is read-only source data. Missing configurations appear separately as predictor estimates, never as benchmark records." action={<span className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs tabular-nums text-[var(--muted)]">{records.length} measured</span>} />
      <Panel title="Measurement filters" detail="Measured values from the benchmark dataset." className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FieldSelect label="Model" value={filters.model} onChange={(value) => setFilter("model", value)} options={[{ value: "", label: "All models" }, ...models.map((model) => ({ value: model.model, label: formatModel(model.model) }))]} />
          <FieldSelect label="Parameters" value={filters.parameters_b} onChange={(value) => setFilter("parameters_b", value)} options={[{ value: "", label: "All sizes" }, ...parameterOptions]} />
          <FieldSelect label="Precision" value={filters.precision} onChange={(value) => setFilter("precision", value)} options={[{ value: "", label: "All precisions" }, ...precisionOptions]} />
          <FieldSelect label="Quantization" value={filters.quantization} onChange={(value) => setFilter("quantization", value)} options={[{ value: "", label: "All quantizations" }, ...quantizationOptions]} />
          <FieldSelect label="Backend" value={filters.backend} onChange={(value) => setFilter("backend", value)} options={[{ value: "", label: "All backends" }, ...backendOptions]} />
          <FieldSelect label="Context" value={filters.context} onChange={(value) => setFilter("context", value)} options={[{ value: "", label: "All contexts" }, ...contextOptions]} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
          <p className="text-[11px] text-[var(--muted)]">Nominal model sizes match the corresponding measured parameter counts.</p>
          <div className="flex gap-2">
            <button type="button" title="Clear filters" aria-label="Clear filters" onClick={clearFilters} className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink)] hover:border-[var(--green)]"><RotateCcw size={14} />Clear</button>
            <button type="button" onClick={applyFilters} className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-[var(--green)] px-3 text-xs font-semibold text-[#09120f] hover:brightness-110"><Filter size={14} />Apply filters</button>
          </div>
        </div>
      </Panel>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => <button type="button" key={metric.key} aria-pressed={metricKey === metric.key} onClick={() => setMetricKey(metric.key)} className={`min-h-9 rounded border px-3 text-xs font-medium transition ${metricKey === metric.key ? "border-[var(--green)] bg-[#234638] text-white" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"}`}>{metric.label}</button>)}
      </div>

      <Panel title={`${activeMetric.label} distribution`} detail={`${activeMetric.label} by ${xAxis === "parameters_b" ? "model size" : "context length"}. Missing values are excluded from this chart.`} action={<div className="flex rounded border border-[var(--line)] bg-[#111715] p-0.5"><button type="button" aria-pressed={xAxis === "parameters_b"} onClick={() => setXAxis("parameters_b")} className={`rounded px-2 py-1 text-[10px] ${xAxis === "parameters_b" ? "bg-[#293532] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Model size</button><button type="button" aria-pressed={xAxis === "context_tokens"} onClick={() => setXAxis("context_tokens")} className={`rounded px-2 py-1 text-[10px] ${xAxis === "context_tokens" ? "bg-[#293532] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Context</button></div>} className="mb-4">
        <MessageState loading={loading} error={error} empty={records.length === 0 ? "No benchmark records match these filters." : undefined} />
        {!loading && !error && records.length > 0 && <div className="h-[280px] w-full" role="img" aria-label={`${activeMetric.label} benchmark scatter chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 18, bottom: 5, left: -8 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis type="number" dataKey="x" name={xAxis === "parameters_b" ? "Parameters (B)" : "Context (tokens)"} tickLine={false} axisLine={false} className="chart-axis" />
              <YAxis type="number" dataKey="y" name={`${activeMetric.label} (${activeMetric.unit})`} tickLine={false} axisLine={false} className="chart-axis" width={52} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 6, borderColor: "#dce4e3", fontSize: 11 }} formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : value, name]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.model} · ${payload[0].payload.precision} · ${payload[0].payload.context} tokens` : ""} />
              <Scatter data={chartData} fill={activeMetric.color} fillOpacity={0.75} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>}
      </Panel>

      <Panel title="Measured observations" detail="All rows below are direct records from amd_llm_lab_master.csv. A dash indicates a value not captured in the source benchmark.">
        <MessageState loading={loading} error={error} empty={records.length === 0 ? "No rows to display." : undefined} />
        {!loading && !error && records.length > 0 && <div className="max-h-[570px] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#111715]"><tr className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted)]">
              <th className="px-2 py-3 font-semibold">Source</th><th className="px-2 py-3 font-semibold">Model</th><th className="px-2 py-3 font-semibold">Params</th><th className="px-2 py-3 font-semibold">Precision</th><th className="px-2 py-3 font-semibold">Quantization</th><th className="px-2 py-3 font-semibold">Context</th><th className="px-2 py-3 font-semibold">Backend</th><th className="px-2 py-3 text-right font-semibold">VRAM</th><th className="px-2 py-3 text-right font-semibold">Throughput</th><th className="px-2 py-3 text-right font-semibold">Latency</th><th className="px-2 py-3 text-right font-semibold">Tokens/GB</th>
            </tr></thead>
            <tbody>{records.map((row, index) => <tr key={`${row.source_file}-${row.context_tokens}-${row.precision}-${index}`} className="border-b border-[var(--line)] hover:bg-[#1c2623]">
              <td className="px-2 py-2.5"><span className="rounded border border-[#2e6655] bg-[#17342c] px-1.5 py-1 text-[9px] font-bold uppercase text-[#70d5b1]">Measured</span></td><td className="px-2 py-2.5 font-medium text-[var(--ink)]">{formatModel(row.model)}</td><td className="px-2 py-2.5 tabular-nums text-[var(--muted)]">{row.parameters_b}</td><td className="px-2 py-2.5 font-medium">{row.precision}</td><td className="px-2 py-2.5 text-[var(--muted)]">{row.quantization}</td><td className="px-2 py-2.5 tabular-nums">{row.context_tokens.toLocaleString()}</td><td className="max-w-[180px] truncate px-2 py-2.5 text-[var(--muted)]" title={row.backend}>{row.backend}</td><td className="px-2 py-2.5 text-right tabular-nums">{formatMetric(row.peak_vram_gb, 2)} GB</td><td className="px-2 py-2.5 text-right tabular-nums">{formatMetric(row.generation_tok_s, 2)}</td><td className="px-2 py-2.5 text-right tabular-nums">{formatMetric(row.latency_s, 2)}</td><td className="px-2 py-2.5 text-right tabular-nums">{formatMetric(row.tokens_per_gb, 2)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>
      <Panel title="Unmeasured configurations" detail="Estimated at 4,096 context from the saved predictors and empirical benchmark distribution. These are not benchmark observations." className="mt-4">
        {estimates.length === 0 ? <p className="text-xs text-[var(--muted)]">Model-based estimates are unavailable until the API and benchmark hardware metadata load.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{estimates.map((row) => <article key={`${row.model}-${row.precision}-${row.backend}`} className="rounded border border-[var(--line)] bg-[#111715] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">{modelLabel(row.model, row.parameters_b)} · {row.precision}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{row.backend}</p></div><span className={`rounded border px-1.5 py-1 text-[8px] font-bold uppercase ${row.source_type === "interpolated" ? "border-[#66552e] bg-[#332c19] text-[#e3c475]" : "border-[#365769] bg-[#192d36] text-[#83cde7]"}`}>{row.source_type}</span></div><div className="mt-3 flex justify-between border-t border-[var(--line)] pt-2 text-[10px] tabular-nums"><span>{row.vram_source_type}: {row.predicted_vram_gb.toFixed(2)} GB</span><span>{row.throughput_source_type}: {row.predicted_generation_tok_s.toFixed(2)} tok/s</span></div><p className="mt-2 text-[9px] text-[var(--muted)]">Calibrated with {row.source_count} measured supporting rows</p></article>)}</div>}
      </Panel>
    </>
  );
}
