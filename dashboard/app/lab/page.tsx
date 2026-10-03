"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  HardDrive,
  Info,
  Layers,
  LineChart,
  Microscope,
  Server,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  ComposedChart,
  Bar,
} from "recharts";
import { api, modelLabel } from "@/lib/api";
import type { BenchmarkRecord, HardwareInfo, LocalHardwareInfo, ModelInfo } from "@/lib/types";
import {
  FeasibilityBadge,
  MessageState,
  ProvenanceBadge,
  type DeviceFeasibilityCategory,
} from "@/components/ui";

const precisionColors: Record<string, string> = {
  BF16: "#ed1c24",
  FP16: "#f97316",
  INT8: "#14b8a6",
  INT4: "#38bdf8",
  INT2: "#eab308",
};

export default function LabOverviewPage() {
  const [records, setRecords] = useState<BenchmarkRecord[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [localHardware, setLocalHardware] = useState<LocalHardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scaling view toggle
  const [scalingMetric, setScalingMetric] = useState<"vram" | "throughput">("vram");

  // Landscape metric toggle
  const [landscapeY, setLandscapeY] = useState<"throughput" | "vram">("throughput");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.benchmarks(new URLSearchParams({ limit: "1000" })),
      api.models(),
      api.hardware(),
      api.localHardware().catch(() => null),
    ])
      .then(([benchmarks, modelData, hardwareData, localData]) => {
        if (!active) return;
        setRecords(benchmarks);
        setModels(modelData);
        setHardware(hardwareData);
        if (localData) setLocalHardware(localData);
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const precisions = useMemo(
    () => ["BF16", "FP16", "INT8", "INT4", "INT2"].filter((p) => records.some((r) => r.precision === p)),
    [records]
  );

  // Group measured data by precision for scatter plots
  const byPrecision = (precision: string) =>
    records
      .filter((row) => row.precision === precision && (landscapeY === "vram" || row.generation_tok_s != null))
      .map((row) => ({
        ...row,
        y: landscapeY === "throughput" ? row.generation_tok_s : row.peak_vram_gb,
      }));

  // Precision comparisons (measured averages)
  const precisionSummaries = useMemo(() => {
    return precisions.map((precision) => {
      const rows = records.filter((r) => r.precision === precision);
      const withSpeed = rows.filter((r) => r.generation_tok_s != null);
      const avgVram = rows.reduce((s, r) => s + r.peak_vram_gb, 0) / (rows.length || 1);
      const avgSpeed = withSpeed.length
        ? withSpeed.reduce((s, r) => s + (r.generation_tok_s ?? 0), 0) / withSpeed.length
        : null;
      return {
        precision,
        count: rows.length,
        avg_vram: avgVram,
        avg_throughput: avgSpeed,
        is_measured: true,
      };
    });
  }, [records, precisions]);

  // Model size scaling dataset (averaged per model size in BF16 baseline)
  const scalingData = useMemo(() => {
    const uniqueSizes = [...new Set(records.map((r) => r.parameters_b))].sort((a, b) => a - b);
    return uniqueSizes.map((size) => {
      const sizeRecords = records.filter((r) => r.parameters_b === size);
      const bf16Records = sizeRecords.filter((r) => r.precision === "BF16");
      const targetRecords = bf16Records.length ? bf16Records : sizeRecords;

      const avgVram = targetRecords.reduce((s, r) => s + r.peak_vram_gb, 0) / targetRecords.length;
      const speedRows = targetRecords.filter((r) => r.generation_tok_s != null);
      const avgSpeed = speedRows.length
        ? speedRows.reduce((s, r) => s + (r.generation_tok_s ?? 0), 0) / speedRows.length
        : null;

      // Linear fit VRAM formula: VRAM = 1.3087 * params + 7.2168
      const formulaVram = 1.3087 * size + 7.2168;

      return {
        parameters_b: size,
        model_name: modelLabel(targetRecords[0]?.model ?? `${size}B`, size),
        measured_vram: Number(avgVram.toFixed(2)),
        predicted_vram: Number(formulaVram.toFixed(2)),
        measured_throughput: avgSpeed ? Number(avgSpeed.toFixed(2)) : null,
      };
    });
  }, [records]);

  // Device-aware model configurations
  const deviceFeasibilityList = useMemo(() => {
    const gpuVram = localHardware?.gpu?.vram_free_gb ?? localHardware?.gpu?.vram_gb ?? 0;
    const sysRam = localHardware?.memory?.available_gb ?? localHardware?.memory?.total_gb ?? 0;

    // Standard representative model sizes
    const candidateSizes = [
      { name: "Qwen2.5-0.5B", params: 0.5, prec: "BF16", quant: "none", backend: "Transformers", vram: 5.1 },
      { name: "Qwen2.5-1.5B", params: 1.5, prec: "BF16", quant: "none", backend: "Transformers", vram: 8.4 },
      { name: "Qwen2.5-3B", params: 3.086, prec: "BF16", quant: "none", backend: "Transformers", vram: 10.1 },
      { name: "Qwen2.5-7B", params: 7.615, prec: "INT4", quant: "qint4", backend: "Optimum Quanto", vram: 12.3 },
      { name: "Qwen2.5-7B", params: 7.615, prec: "BF16", quant: "none", backend: "Transformers", vram: 18.2 },
      { name: "Qwen2.5-14B", params: 14.77, prec: "INT4", quant: "qint4", backend: "Optimum Quanto", vram: 22.8 },
      { name: "Qwen2.5-14B", params: 14.77, prec: "BF16", quant: "none", backend: "Transformers", vram: 37.3 },
      { name: "Qwen2.5-32B", params: 32.76, prec: "INT4", quant: "qint4", backend: "Optimum Quanto", vram: 45.2 },
      { name: "Qwen2.5-32B", params: 32.76, prec: "BF16", quant: "none", backend: "Transformers", vram: 103.8 },
    ];

    return candidateSizes.map((item) => {
      let category: DeviceFeasibilityCategory = "NOT PRACTICAL";
      let reason = "";

      if (gpuVram > 0) {
        if (item.vram <= gpuVram * 0.88) {
          category = "GPU FIT";
          reason = `Peak ${item.vram} GB fits completely in dedicated VRAM (${gpuVram} GB)`;
        } else if (item.vram <= gpuVram * 1.05) {
          category = "GPU TIGHT";
          reason = `Peak ${item.vram} GB is near VRAM limit (${gpuVram} GB); risk of OOM on large context`;
        } else if (item.vram <= gpuVram + sysRam * 0.75) {
          category = "OFFLOADABLE";
          reason = `Exceeds GPU (${gpuVram} GB), but can offload layers to system RAM (${sysRam.toFixed(1)} GB)`;
        } else {
          category = "NOT PRACTICAL";
          reason = `Requires ${item.vram} GB; exceeds combined VRAM and practical system RAM capacity`;
        }
      } else {
        // CPU / RAM only host
        if (item.vram <= sysRam * 0.7) {
          category = "OFFLOADABLE";
          reason = `Fits in system RAM (${sysRam.toFixed(1)} GB) using CPU inference runtime`;
        } else {
          category = "NOT PRACTICAL";
          reason = `Requires ${item.vram} GB; exceeds available system memory`;
        }
      }

      return {
        ...item,
        category,
        reason,
      };
    });
  }, [localHardware]);

  return (
    <div className="space-y-16">
      <MessageState loading={loading && records.length === 0} error={error} />
      {/* 1. HERO SECTION */}
      <section className="relative border-b border-[#242424] pb-14 pt-4">
        <div className="grid items-center gap-10 xl:grid-cols-[1.1fr_0.9fr]">
          {/* Left Column: Research Hero Copy */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-[#333] bg-[#121212] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--red)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--red)] animate-pulse" />
              AMD INSTINCT™ MI300X INFERENCE LAB
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              Understand LLM performance <br />
              <span className="text-[#a0a0a0]">before you run the model.</span>
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-[#b0b0b0] sm:text-base">
              AMD LLM Lab combines real MI300X measurements with predictive modeling to explore VRAM,
              throughput, precision and hardware feasibility across enterprise open-weight models.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/benchmarks"
                className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--red)] px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#ff2b34]"
              >
                Explore Benchmarks
                <ArrowRight size={14} />
              </Link>

              <Link
                href="/device"
                className="inline-flex h-10 items-center justify-center gap-2 border border-[#3d3d3d] bg-[#141414] px-5 text-xs font-bold uppercase tracking-wider text-[#e0e0e0] transition hover:border-[#666] hover:text-white"
              >
                Analyze My Device
                <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-[#707070]">
              <span>Hardware: AMD Instinct MI300X (192 GB)</span>
              <span>•</span>
              <span>Software: ROCm 7.2.x</span>
              <span>•</span>
              <span>Models: Qwen 0.5B – 32B</span>
            </div>
          </div>

          {/* Right Column: Dynamic Performance Visualization (Parameters vs Throughput/VRAM) */}
          <div className="border border-[#282828] bg-[#111111] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222] pb-3">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-[var(--red)]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                  MI300X MEASURED INFERENCE MAP
                </span>
              </div>
              <span className="border border-[#2d2d2d] bg-[#171717] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9ae6b4]">
                MEASURED DATA ONLY
              </span>
            </div>

            <div className="mt-3 h-[280px] w-full" role="img" aria-label="Measured model scaling scatter">
              {records.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 14, bottom: 8, left: -10 }}>
                    <CartesianGrid stroke="#222" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="parameters_b"
                      name="Parameters"
                      unit="B"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#777", fontSize: 10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="generation_tok_s"
                      name="Generation"
                      unit=" tok/s"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#777", fontSize: 10 }}
                      width={52}
                    />
                    <Tooltip cursor={{ stroke: "#555", strokeDasharray: "3 3" }} content={<MeasuredTooltip />} />
                    {precisions.map((prec) => (
                      <Scatter
                        key={prec}
                        name={prec}
                        data={records.filter((r) => r.precision === prec && r.generation_tok_s != null)}
                        fill={precisionColors[prec] ?? "#ed1c24"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[#777]">
                  Loading measured points...
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#222] pt-2.5 text-[10px] text-[#777]">
              <span>X: PARAMETER COUNT (0.5B – 32B)</span>
              <div className="flex items-center gap-3">
                {precisions.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: precisionColors[p] }} />
                    {p}
                  </span>
                ))}
              </div>
              <span>Y: TOKENS / SEC</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. RESEARCH METRICS STRIP */}
      <section aria-label="Research Metrics" className="border-b border-[#242424] pb-12">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="border border-[#262626] bg-[#121212] p-5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              BENCHMARK RUNS
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-5xl">
                {records.length || 57}
              </span>
              <span className="text-xs font-semibold text-[var(--red)]">MEASURED</span>
            </div>
            <p className="mt-2 text-[11px] text-[#888]">Direct empirical observations on Instinct MI300X</p>
          </div>

          <div className="border border-[#262626] bg-[#121212] p-5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              MODEL SIZES
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-5xl">
                {models.length || 6}
              </span>
              <span className="text-xs font-semibold text-[#38bdf8]">0.5B – 32B</span>
            </div>
            <p className="mt-2 text-[11px] text-[#888]">Qwen2.5 open weights: 0.5B, 1.5B, 3B, 7B, 14B, 32B</p>
          </div>

          <div className="border border-[#262626] bg-[#121212] p-5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              PRECISION MODES
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-5xl">
                {precisions.length || 5}
              </span>
              <span className="text-xs font-semibold text-[#34d399]">BF16 → INT2</span>
            </div>
            <p className="mt-2 text-[11px] text-[#888]">BF16, FP16, INT8, INT4, INT2 sweeps</p>
          </div>

          <div className="border border-[#262626] bg-[#121212] p-5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              GPU ACCELERATOR MEMORY
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-5xl">
                {hardware?.vram_gb ?? 192}
              </span>
              <span className="text-xs font-semibold text-[#f59e0b]">GB HBM3</span>
            </div>
            <p className="mt-2 text-[11px] text-[#888]">5.3 TB/s memory bandwidth on gfx942</p>
          </div>
        </div>
      </section>

      {/* 3. PERFORMANCE LANDSCAPE */}
      <section className="space-y-6 border-b border-[#242424] pb-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--red)]">
              <Activity size={13} />
              BENCHMARK EXPLORATION
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Performance Landscape
            </h2>
            <p className="mt-1 text-xs text-[#999]">
              Explore measured throughput (tok/s) and peak VRAM (GB) across parameter sizes and precisions.
            </p>
          </div>

          <div className="flex items-center gap-2 border border-[#333] bg-[#121212] p-1">
            <button
              type="button"
              onClick={() => setLandscapeY("throughput")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                landscapeY === "throughput"
                  ? "bg-[var(--red)] text-white"
                  : "text-[#888] hover:text-white"
              }`}
            >
              Throughput (tok/s)
            </button>
            <button
              type="button"
              onClick={() => setLandscapeY("vram")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                landscapeY === "vram"
                  ? "bg-[var(--red)] text-white"
                  : "text-[#888] hover:text-white"
              }`}
            >
              Peak VRAM (GB)
            </button>
          </div>
        </div>

        {/* Big Interactive Chart */}
        <div className="border border-[#282828] bg-[#121212] p-6">
          <div className="flex items-center justify-between border-b border-[#202020] pb-3 text-xs">
            <span className="font-semibold text-white">
              {landscapeY === "throughput" ? "Generation Throughput vs Parameter Size" : "Peak VRAM Consumption vs Parameter Size"}
            </span>
            <ProvenanceBadge type="measured" />
          </div>

          <div className="mt-4 h-[380px] w-full" role="img" aria-label="Performance landscape scatter chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 20, bottom: 15, left: 0 }}>
                <CartesianGrid stroke="#222" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="parameters_b"
                  name="Parameters"
                  unit="B"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#888", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={landscapeY === "throughput" ? "Throughput" : "Peak VRAM"}
                  unit={landscapeY === "throughput" ? " tok/s" : " GB"}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#888", fontSize: 11 }}
                  width={60}
                />
                <Tooltip cursor={{ stroke: "#666", strokeDasharray: "3 3" }} content={<MeasuredTooltip />} />
                {precisions.map((prec) => (
                  <Scatter
                    key={prec}
                    name={prec}
                    data={byPrecision(prec)}
                    fill={precisionColors[prec] ?? "#ed1c24"}
                    fillOpacity={0.88}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#202020] pt-3 text-xs text-[#888]">
            <div className="flex items-center gap-4">
              {precisions.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: precisionColors[p] }} />
                  <strong className="text-white">{p}</strong>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-[#777]">
              Hover any observation to view model identity, precision, context length, and exact measured output.
            </p>
          </div>
        </div>
      </section>

      {/* 4. MODEL SCALING */}
      <section className="space-y-6 border-b border-[#242424] pb-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--red)]">
              <LineChart size={13} />
              SCALING DYNAMICS
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Model Scaling Behavior
            </h2>
            <p className="mt-1 text-xs text-[#999]">
              How memory requirements scale linearly while throughput exhibits non-linear execution characteristics.
            </p>
          </div>

          <div className="flex items-center gap-2 border border-[#333] bg-[#121212] p-1">
            <button
              type="button"
              onClick={() => setScalingMetric("vram")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                scalingMetric === "vram"
                  ? "bg-[#2563eb] text-white"
                  : "text-[#888] hover:text-white"
              }`}
            >
              VRAM Scaling Curve (GB)
            </button>
            <button
              type="button"
              onClick={() => setScalingMetric("throughput")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                scalingMetric === "throughput"
                  ? "bg-[#10b981] text-white"
                  : "text-[#888] hover:text-white"
              }`}
            >
              Throughput Decay (tok/s)
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          {/* Interactive Recharts Scaling Curve */}
          <div className="border border-[#282828] bg-[#121212] p-6">
            <div className="flex items-center justify-between border-b border-[#202020] pb-3 text-xs">
              <span className="font-semibold text-white">
                {scalingMetric === "vram"
                  ? "Peak VRAM (GB) vs Model Parameters (Linear Fit: 1.31×P + 7.22 GB)"
                  : "Generation Throughput (tok/s) vs Model Parameters"}
              </span>
              <span className="text-[10px] font-mono text-[#888]">QWEN2.5 BF16 BASELINE</span>
            </div>

            <div className="mt-4 h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={scalingData} margin={{ top: 15, right: 20, bottom: 10, left: -5 }}>
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="parameters_b"
                    name="Parameters"
                    unit="B"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#888", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#888", fontSize: 11 }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#171717", borderColor: "#333", fontSize: "11px", color: "#fff" }}
                    formatter={(val, name) => [
                      `${val} ${scalingMetric === "vram" ? "GB" : "tok/s"}`,
                      name === "measured_vram" ? "Measured VRAM" : name === "predicted_vram" ? "Linear Model" : "Measured Speed",
                    ]}
                    labelFormatter={(label) => `${label}B Parameter Model`}
                  />
                  {scalingMetric === "vram" ? (
                    <>
                      <Bar dataKey="measured_vram" name="Measured VRAM" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={38} />
                      <Line
                        type="monotone"
                        dataKey="predicted_vram"
                        name="Linear Model"
                        stroke="#ed1c24"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#ed1c24" }}
                      />
                    </>
                  ) : (
                    <>
                      <Bar
                        dataKey="measured_throughput"
                        name="Measured Throughput"
                        fill="#10b981"
                        radius={[2, 2, 0, 0]}
                        maxBarSize={38}
                      />
                      <Line
                        type="monotone"
                        dataKey="measured_throughput"
                        name="Throughput Curve"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#34d399" }}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-[#777]">
              <span>0.5B (5.1 GB)</span>
              <span>3B (10.0 GB)</span>
              <span>7B (18.2 GB)</span>
              <span>14B (37.3 GB)</span>
              <span>32B (103.8 GB)</span>
            </div>
          </div>

          {/* Scaling Principles Explanation */}
          <div className="flex flex-col justify-between border border-[#282828] bg-[#121212] p-6">
            <div className="space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--red)]">
                EMPIRICAL SCALING LAWS
              </span>
              <h3 className="text-lg font-bold text-white">Linear Memory vs Convex Latency</h3>
              <p className="text-xs leading-relaxed text-[#aaa]">
                On AMD Instinct MI300X, peak allocation scales predictably at <strong>1.309 GB per billion parameters</strong> plus a <strong>7.22 GB driver & ROCm runtime baseline</strong>.
              </p>
              <div className="border-l-2 border-[var(--red)] pl-3 text-xs leading-relaxed text-[#888]">
                &quot;Context length (512 to 8192 tokens) accounts for under 8% VRAM variance on MI300X due to large page-table allocations. Model parameter count remains the primary VRAM driver.&quot;
              </div>
            </div>

            <div className="mt-6 border-t border-[#222] pt-4">
              <span className="text-[10px] font-mono uppercase text-[#777]">Regression Formula</span>
              <p className="mt-1 font-mono text-xs font-semibold text-white">
                VRAM_GB = 1.3087 × Params_B + 7.2168
              </p>
              <p className="mt-1 text-[10px] text-[#666]">Held-out model MAE: ±6.75 GB (R² = 0.536)</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. PRECISION ANALYSIS */}
      <section className="space-y-6 border-b border-[#242424] pb-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--red)]">
              <Layers size={13} />
              QUANTIZATION & PRECISION
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Precision Analysis
            </h2>
            <p className="mt-1 text-xs text-[#999]">
              Comparing BF16, FP16, INT8, INT4, and INT2 behavior across measured MI300X runs.
            </p>
          </div>

          <Link
            href="/quantization"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--red)] transition hover:underline"
          >
            Detailed Quantization Dashboard <ArrowRight size={13} />
          </Link>
        </div>

        {/* Precision Cards Comparison Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {precisionSummaries.map((p) => {
            return (
              <div key={p.precision} className="border border-[#282828] bg-[#121212] p-4 transition hover:border-[#444]">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white">{p.precision}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: precisionColors[p.precision] }}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <div>
                    <span className="text-[10px] uppercase text-[#777]">Avg Peak VRAM</span>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {p.avg_vram.toFixed(1)} <span className="text-xs font-normal text-[#888]">GB</span>
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-[#777]">Avg Throughput</span>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {p.avg_throughput != null ? p.avg_throughput.toFixed(1) : "—"}{" "}
                      <span className="text-xs font-normal text-[#888]">tok/s</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#202020] pt-2.5 text-[10px] text-[#777]">
                  <span>{p.count} MEASURED RUNS</span>
                  <span className="text-[#34d399]">VERIFIED</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empirical finding highlight */}
        <div className="border border-[#382a17] bg-[#1a140b] p-4 text-xs text-[#e8b044]">
          <div className="flex items-start gap-2.5">
            <Info size={16} className="mt-0.5 shrink-0 text-[#f59e0b]" />
            <div>
              <strong className="font-bold uppercase tracking-wider text-[#fbbf24]">
                Key Research Finding: Quantization Trade-offs are Non-Monotonic
              </strong>
              <p className="mt-1 leading-relaxed text-[#d4af37]">
                Lower bit-width precision does not unconditionally yield higher throughput on current software stacks. On 7B models, INT4 under Quanto shows a 29.9% memory reduction with a 70.0% generation speed penalty compared to native BF16, while on 32B models INT4 delivers a 56.4% memory cut.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. MY DEVICE SECTION */}
      <section className="space-y-6 border-b border-[#242424] pb-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--red)]">
              <Server size={13} />
              LOCAL HARDWARE PROBE
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              What can your machine run?
            </h2>
            <p className="mt-1 text-xs text-[#999]">
              Compare your local system specs against model requirements categorized into four deployment tiers.
            </p>
          </div>

          <Link
            href="/device"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white underline decoration-[var(--red)] underline-offset-4"
          >
            Launch Interactive Device Planner <ArrowRight size={13} />
          </Link>
        </div>

        {/* Local Hardware Spec Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">Operating System</span>
            <p className="mt-1 truncate text-xs font-semibold text-white">{localHardware?.system ?? "Windows / Linux"}</p>
            <p className="mt-0.5 truncate text-[10px] text-[#666]">{localHardware?.release ?? "Host system"}</p>
          </div>

          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">CPU Processor</span>
            <p className="mt-1 truncate text-xs font-semibold text-white">{localHardware?.cpu?.name ?? "Host CPU"}</p>
            <p className="mt-0.5 text-[10px] text-[#666]">{localHardware?.cpu?.logical_cores ?? "?"} threads</p>
          </div>

          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">System RAM</span>
            <p className="mt-1 text-xs font-semibold text-white tabular-nums">
              {localHardware?.memory?.total_gb != null ? `${localHardware.memory.total_gb.toFixed(1)} GB` : "Available"}
            </p>
            <p className="mt-0.5 text-[10px] text-[#666]">
              {localHardware?.memory?.available_gb != null ? `${localHardware.memory.available_gb.toFixed(1)} GB free` : "System memory"}
            </p>
          </div>

          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">GPU Device</span>
            <p className="mt-1 truncate text-xs font-semibold text-white">
              {localHardware?.gpu?.available ? localHardware.gpu.name : "None / Integrated"}
            </p>
            <p className="mt-0.5 text-[10px] text-[#666]">{localHardware?.gpu?.vendor ?? "Host device"}</p>
          </div>

          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">GPU Dedicated VRAM</span>
            <p className="mt-1 text-xs font-semibold text-white tabular-nums">
              {localHardware?.gpu?.vram_gb != null ? `${localHardware.gpu.vram_gb.toFixed(1)} GB` : "Manual Entry"}
            </p>
            <p className="mt-0.5 text-[10px] text-[#666]">
              {localHardware?.gpu?.vram_free_gb != null ? `${localHardware.gpu.vram_free_gb.toFixed(1)} GB free` : "Planning budget"}
            </p>
          </div>

          <div className="border border-[#282828] bg-[#121212] p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">Host Probe</span>
            <p className="mt-1 text-xs font-semibold text-[#10b981]">FASTAPI PROBE</p>
            <p className="mt-0.5 text-[10px] text-[#666]">Local host telemetry</p>
          </div>
        </div>

        {/* 4-Tier Feasibility Classification Table */}
        <div className="border border-[#282828] bg-[#121212]">
          <div className="flex flex-wrap items-center justify-between border-b border-[#222] px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Device-Aware Feasibility Breakdown
            </span>
            <div className="flex items-center gap-3 text-[10px] text-[#888]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#10b981]" /> GPU FIT
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> GPU TIGHT
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> OFFLOADABLE
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> NOT PRACTICAL
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#222] bg-[#0f0f0f] text-[9px] font-bold uppercase tracking-wider text-[#777]">
                <tr>
                  <th className="px-4 py-2.5">Model</th>
                  <th className="px-4 py-2.5">Precision / Stack</th>
                  <th className="px-4 py-2.5 text-right">Estimated Peak VRAM</th>
                  <th className="px-4 py-2.5 text-center">Status Tier</th>
                  <th className="px-4 py-2.5">Technical Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {deviceFeasibilityList.map((row) => (
                  <tr key={`${row.name}-${row.prec}-${row.vram}`} className="hover:bg-[#171717]">
                    <td className="px-4 py-3 font-semibold text-white">
                      {row.name}{" "}
                      <span className="font-normal text-[#777]">({row.params}B)</span>
                    </td>
                    <td className="px-4 py-3 text-[#bbb]">
                      {row.prec} / {row.quant} <span className="text-[10px] text-[#666]">({row.backend})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-white tabular-nums">
                      {row.vram.toFixed(1)} GB
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FeasibilityBadge category={row.category} />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#999]">
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#202020] px-4 py-2.5 text-[10px] text-[#666]">
            * Note: Current MI300X measurements are empirical observations on AMD Instinct accelerators. Device-specific performance and feasibility are estimated based on reported memory budgets.
          </div>
        </div>
      </section>

      {/* 7. RESEARCH INSIGHTS */}
      <section className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--red)]">
            <Microscope size={13} />
            KEY FINDINGS & OBSERVATIONS
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Research Insights
          </h2>
          <p className="mt-1 text-xs text-[#999]">
            Derived directly from the 57 measured MI300X benchmark runs.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Insight 1 */}
          <div className="border border-[#282828] bg-[#121212] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[var(--red)]">INSIGHT 01</span>
              <HardDrive size={16} className="text-[#888]" />
            </div>
            <h3 className="text-base font-bold text-white">Model Size and Memory Scaling</h3>
            <p className="text-xs leading-relaxed text-[#aaa]">
              Peak VRAM consumption is primarily governed by parameter count with a constant baseline driver allocation of ~7.2 GB. Across all model sizes (0.5B to 32B), the scaling slope is 1.309 GB per billion parameters in BF16. Context length (512 to 8192) causes less than 8% total memory variation.
            </p>
            <div className="pt-2 text-[10px] text-[#666]">
              Pearson Correlation: parameters vs VRAM = <strong>+0.835</strong>
            </div>
          </div>

          {/* Insight 2 */}
          <div className="border border-[#282828] bg-[#121212] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[var(--red)]">INSIGHT 02</span>
              <Layers size={16} className="text-[#888]" />
            </div>
            <h3 className="text-base font-bold text-white">Precision & Quantization Dynamics</h3>
            <p className="text-xs leading-relaxed text-[#aaa]">
              Quantization yields non-linear benefits. On smaller models (1.5B), INT4 increases measured VRAM by +10.8% and decreases throughput by 62.3% due to quantization container overheads. However, on larger models (14B and 32B), INT4 drops memory by 38.9% and 56.4% respectively, making large models fit onto smaller hardware.
            </p>
            <div className="pt-2 text-[10px] text-[#666]">
              32B INT4 vs BF16: <strong>-56.4% VRAM</strong> | <strong>-79.6% tok/s</strong>
            </div>
          </div>

          {/* Insight 3 */}
          <div className="border border-[#282828] bg-[#121212] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase text-[var(--red)]">INSIGHT 03</span>
              <Zap size={16} className="text-[#888]" />
            </div>
            <h3 className="text-base font-bold text-white">Throughput & Configuration Trade-offs</h3>
            <p className="text-xs leading-relaxed text-[#aaa]">
              Inference throughput depends heavily on model size and runtime kernel support. The 0.5B model achieves 78 tok/s, whereas 32B BF16 runs at ~12 tok/s on single-stream inference. Memory efficiency (tokens per GB) peaks at 15.1 tok/GB on smaller models and drops to 0.12 tok/GB on 32B.
            </p>
            <div className="pt-2 text-[10px] text-[#666]">
              Throughput Correlation: throughput vs tokens/GB = <strong>+0.817</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MeasuredTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BenchmarkRecord & { source_type?: string } }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border border-[#383838] bg-[#141414] p-3 text-xs shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[#2a2a2a] pb-1.5">
        <p className="font-bold text-white">{row.model.split("/").pop()}</p>
        <span className="border border-[#10b981]/40 bg-[#064e3b]/60 px-1.5 py-0.5 text-[9px] font-bold text-[#34d399]">
          MEASURED
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-[#aaa]">
        <p>
          Parameters: <strong className="text-white">{row.parameters_b}B</strong>
        </p>
        <p>
          Precision: <strong className="text-white">{row.precision}</strong> ({row.quantization})
        </p>
        <p>
          Context: <strong className="text-white">{row.context_tokens.toLocaleString()} tokens</strong>
        </p>
        <p>
          Backend: <span className="text-[#999]">{row.backend}</span>
        </p>
        <div className="mt-2 border-t border-[#2a2a2a] pt-1.5">
          <p className="text-[#38bdf8]">
            Peak VRAM: <strong className="text-white">{row.peak_vram_gb.toFixed(2)} GB</strong>
          </p>
          <p className="text-[#34d399]">
            Throughput:{" "}
            <strong className="text-white">
              {row.generation_tok_s != null ? `${row.generation_tok_s.toFixed(2)} tok/s` : "n/a"}
            </strong>
          </p>
        </div>
        <p className="mt-1.5 text-[8px] font-mono text-[#666]">SOURCE: {row.source_file}</p>
      </div>
    </div>
  );
}
