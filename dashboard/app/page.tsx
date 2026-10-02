"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { api } from "@/lib/api";
import type { BenchmarkRecord, HardwareInfo, ModelInfo } from "@/lib/types";
import { MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

type PrecisionSummary = { precision: string; avg_vram: number; avg_throughput: number; count: number };

function ScatterPanel({ title, detail, data, xKey, xLabel, yKey, yLabel, color }: {
  title: string; detail: string; data: object[];
  xKey: string; xLabel: string; yKey: string; yLabel: string; color: string;
}) {
  return (
    <Panel title={title} detail={detail}>
      <div className="h-[235px] w-full" role="img" aria-label={`${title} scatter chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 14, bottom: 6, left: -12 }}>
            <CartesianGrid className="chart-grid" vertical={false} />
            <XAxis type="number" dataKey={xKey} name={xLabel} tickLine={false} axisLine={false} className="chart-axis" tick={{ fontSize: 10 }} />
            <YAxis type="number" dataKey={yKey} name={yLabel} tickLine={false} axisLine={false} className="chart-axis" tick={{ fontSize: 10 }} width={46} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 6, borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : value, name]} />
            <Scatter data={data} fill={color} fillOpacity={0.72} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]"><span>{xLabel}</span><span>{yLabel}</span></div>
    </Panel>
  );
}

export default function OverviewPage() {
  const [records, setRecords] = useState<BenchmarkRecord[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.benchmarks(new URLSearchParams({ limit: "1000" })), api.models(), api.hardware()])
      .then(([benchmarkData, modelData, hardwareData]) => {
        setRecords(benchmarkData);
        setModels(modelData);
        setHardware(hardwareData);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const vram = records.map((row) => row.peak_vram_gb).filter(Number.isFinite);
    const throughput = records.map((row) => row.generation_tok_s).filter((value): value is number => value != null && Number.isFinite(value));
    return {
      vramRange: vram.length ? `${Math.min(...vram).toFixed(2)} to ${Math.max(...vram).toFixed(2)}` : "—",
      throughputRange: throughput.length ? `${Math.min(...throughput).toFixed(2)} to ${Math.max(...throughput).toFixed(2)}` : "—",
      summaries: ["BF16", "FP16", "INT8", "INT4", "INT2"].map((precision): PrecisionSummary => {
        const rows = records.filter((record) => record.precision === precision);
        return {
          precision,
          count: rows.length,
          avg_vram: rows.reduce((sum, row) => sum + row.peak_vram_gb, 0) / (rows.length || 1),
          avg_throughput: rows.reduce((sum, row) => sum + (row.generation_tok_s ?? 0), 0) / (rows.filter((row) => row.generation_tok_s != null).length || 1),
        };
      }).filter((row) => row.count > 0),
    };
  }, [records]);

  const throughputRows = records.filter((row) => row.generation_tok_s != null);

  return (
    <>
      <PageHeader eyebrow="MI300X research results" title="AMD LLM LAB" detail="Measured inference behavior across model sizes, precision levels, contexts, and backends." action={<a href="/benchmarks" className="inline-flex items-center gap-1.5 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--green)]">Explore measurements <ArrowUpRight size={14} /></a>} />
      <MessageState loading={loading} error={error} />
      {!loading && !error && <>
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile label="Hardware" value="MI300X" note={`${hardware?.architecture ?? "gfx942"} · ROCm ${hardware?.rocm ?? "7.2.x"}`} tone="red" />
          <StatTile label="Usable VRAM" value="191.69" suffix="GB" note={`${hardware?.vram_gb ?? 192} GB reported capacity`} tone="green" />
          <StatTile label="Model sizes" value={String(models.length)} note="Qwen2.5 parameter scales" tone="blue" />
          <StatTile label="Benchmark observations" value={String(records.length)} note="Measured configurations" tone="amber" />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile label="Measured VRAM range" value={stats.vramRange} suffix="GB" note="Peak VRAM across the benchmark set" tone="blue" />
          <StatTile label="Measured generation throughput" value={stats.throughputRange} suffix="tok/s" note={`${throughputRows.length} records with throughput measurements`} tone="green" />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Measured scaling</h2>
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]"><CircleHelp size={13} />Each dot is a benchmark observation</span>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <ScatterPanel title="Parameters vs VRAM" detail="Peak memory rises with model size." data={records} xKey="parameters_b" xLabel="Parameters (B)" yKey="peak_vram_gb" yLabel="Peak VRAM (GB)" color="#d62932" />
          <ScatterPanel title="Parameters vs throughput" detail="Throughput observations exclude records without latency." data={throughputRows} xKey="parameters_b" xLabel="Parameters (B)" yKey="generation_tok_s" yLabel="Generation (tok/s)" color="#137c67" />
          <ScatterPanel title="Context vs VRAM" detail="Context length has a weak relationship with measured peak VRAM in this dataset." data={records} xKey="context_tokens" xLabel="Context (tokens)" yKey="peak_vram_gb" yLabel="Peak VRAM (GB)" color="#397c9a" />
          <ScatterPanel title="Context vs throughput" detail="Throughput varies across size, precision, and backend configurations." data={throughputRows} xKey="context_tokens" xLabel="Context (tokens)" yKey="generation_tok_s" yLabel="Generation (tok/s)" color="#b17a23" />
        </div>

        <Panel title="Precision comparison" detail="Mean measured results by precision. Backend differences remain inside each group.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">Average peak VRAM · GB</p>
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.summaries} margin={{ top: 8, right: 10, bottom: 0, left: -14 }}>
                    <CartesianGrid className="chart-grid" vertical={false} />
                    <XAxis dataKey="precision" tickLine={false} axisLine={false} className="chart-axis" />
                    <YAxis tickLine={false} axisLine={false} className="chart-axis" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 6, borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} formatter={(value) => [Number(value).toFixed(2), "Avg VRAM (GB)"]} />
                    <Bar dataKey="avg_vram" fill="#397c9a" radius={[3, 3, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">Average generation throughput · tok/s</p>
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.summaries} margin={{ top: 8, right: 10, bottom: 0, left: -14 }}>
                    <CartesianGrid className="chart-grid" vertical={false} />
                    <XAxis dataKey="precision" tickLine={false} axisLine={false} className="chart-axis" />
                    <YAxis tickLine={false} axisLine={false} className="chart-axis" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 6, borderColor: "#293635", background: "#171f1d", color: "#ecf2f0", fontSize: 11 }} formatter={(value) => [Number(value).toFixed(2), "Avg throughput (tok/s)"]} />
                    <Bar dataKey="avg_throughput" fill="#137c67" radius={[3, 3, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] leading-5 text-[var(--muted)]">Quantization does not produce a uniform performance response on this hardware and software stack. Compare by backend and model in the benchmark explorer before choosing a configuration.</p>
        </Panel>
      </>}
    </>
  );
}
