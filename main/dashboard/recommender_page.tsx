"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Check, CircleHelp, Cpu, Gauge, RefreshCw, Zap } from "lucide-react";
import { api, modelLabel } from "@/lib/api";
import type { LocalHardwareInfo, RecommendationResponse, RecommendationRow } from "@/lib/types";
import { FieldNumber, FieldSelect, MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

const objectives = ["throughput", "memory", "balanced"] as const;
type Scope = "all" | "estimate-matches" | "closest";

function Provenance({ row }: { row: RecommendationRow }) {
  const style = row.source_type === "measured"
    ? "border-[#2e6655] bg-[#17342c] text-[#70d5b1]"
    : row.source_type === "interpolated"
      ? "border-[#66552e] bg-[#332c19] text-[#e3c475]"
      : "border-[#365769] bg-[#192d36] text-[#83cde7]";
  return <span className={`inline-flex items-center rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${style}`}>{row.source_type}</span>;
}

export default function RecommenderPage() {
  const [availableVram, setAvailableVram] = useState(0);
  const [minimumThroughput, setMinimumThroughput] = useState(0);
  const [context, setContext] = useState("4096");
  const [objective, setObjective] = useState<(typeof objectives)[number]>("balanced");
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [device, setDevice] = useState<LocalHardwareInfo | null>(null);
  const [contexts, setContexts] = useState<number[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");

  useEffect(() => {
    Promise.all([api.localHardware(), api.models()]).then(([info, models]) => {
      setDevice(info);
      const observedContexts = [...new Set(models.flatMap((model) => model.context_lengths))].sort((a, b) => a - b);
      setContexts(observedContexts);
      if (observedContexts.length) setContext(String(observedContexts[0]));
      if (info.gpu.vram_free_gb && info.gpu.vram_free_gb > 0) setAvailableVram(info.gpu.vram_free_gb);
      else if (info.gpu.vram_gb && info.gpu.vram_gb > 0) setAvailableVram(info.gpu.vram_gb);
    }).catch((reason: Error) => setDeviceError(reason.message));
  }, []);

  useEffect(() => {
    let active = true;
    if (availableVram <= 0 || !context) return;
    const timer = window.setTimeout(() => {
      setSubmitting(true);
      setError(null);
      api.recommend({
        available_vram_gb: availableVram,
        minimum_throughput_tok_s: minimumThroughput,
        context_tokens: Number(context),
        objective,
      }).then((value) => { if (active) setResult(value); })
        .catch((reason: Error) => { if (active) setError(reason.message); })
        .finally(() => { if (active) setSubmitting(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [availableVram, minimumThroughput, context, objective]);

  const rows = useMemo(() => result?.candidate_configurations ?? [], [result]);
  const shownRows = useMemo(() => {
    if (scope === "estimate-matches") return rows.filter((row) => row.fits_vram && row.meets_throughput);
    if (scope === "closest") return rows.filter((row) => !row.fits_vram || !row.meets_throughput)
      .sort((a, b) => Number(b.fits_vram) + Number(b.meets_throughput) - Number(a.fits_vram) - Number(a.meets_throughput));
    return rows;
  }, [rows, scope]);
  const feasibleCount = rows.filter((row) => row.fits_vram && row.meets_throughput).length;
  const observedCount = rows.filter((row) => row.source_type === "measured").length;

  return <>
    <PageHeader eyebrow="Inference planning / MI300X model space" title="Recommender" detail="Compare benchmark-backed and model-estimated stacks against your memory and throughput limits." action={<span className="inline-flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]"><Activity size={14} className={submitting ? "animate-pulse text-[var(--amber)]" : "text-[var(--green)]"} />{submitting ? "Updating plan" : "Live plan"}</span>} />

    <section className="mb-5 grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[#202b28] text-[var(--green)]"><Cpu size={19} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">My Device · FastAPI host</p>{device?.gpu.available && <span className="rounded border border-[#2e6655] bg-[#17342c] px-1.5 py-0.5 text-[9px] uppercase text-[#70d5b1]">GPU detected</span>}</div><p className="mt-1 truncate text-sm font-semibold">{device?.gpu.name ?? (device ? "No supported GPU telemetry" : "Detecting local hardware")}</p><p className="mt-1 truncate text-[11px] text-[var(--muted)]">{device ? `${device.platform} · ${device.cpu.logical_cores} CPU threads · ${device.memory.total_gb == null ? "RAM unavailable" : `${device.memory.total_gb} GB RAM`}` : deviceError ?? "Reading the machine running the local API"}</p></div></div>
      <div className="flex items-center gap-3 border-t border-[var(--line)] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Planning VRAM budget</p><p className="mt-1 text-xs text-[var(--ink)]">{device?.gpu.vram_free_gb != null ? `${device.gpu.vram_free_gb} GB currently free · editable` : device?.gpu.vram_gb != null ? `${device.gpu.vram_gb} GB total detected · editable` : "Set manually when GPU VRAM is unavailable"}</p></div><Gauge size={16} className="ml-auto shrink-0 text-[var(--blue)]" /></div>
      <button type="button" onClick={() => { if (device?.gpu.vram_free_gb) setAvailableVram(device.gpu.vram_free_gb); }} disabled={!device?.gpu.vram_free_gb} title="Use currently free GPU memory" className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[var(--line)] px-3 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--green)] disabled:opacity-40"><RefreshCw size={13} />Use free VRAM</button>
      {deviceError && <p className="md:col-span-3 text-[10px] text-[var(--amber)]">Local device detection unavailable. Set the VRAM planning budget below; the recommendation model remains MI300X-trained.</p>}
      <p className="md:col-span-3 text-[10px] leading-4 text-[var(--muted)]">Device details describe the computer running FastAPI. Predictions remain calibrated to MI300X benchmarks; detected VRAM is used only as the capacity constraint.</p>
    </section>

    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="Planning constraints" detail="The candidate space is generated from six benchmarked model sizes and six supported stacks.">
        <div className="grid gap-4">
          <FieldNumber label="Available VRAM" value={availableVram} onChange={setAvailableVram} min={0.25} step={0.25} suffix="GB" />
          <FieldNumber label="Minimum generation rate" value={minimumThroughput} onChange={setMinimumThroughput} min={0} step={1} suffix="tok/s" />
          <FieldSelect label="Context length" value={context} onChange={setContext} options={contexts.map((value) => ({ value: String(value), label: `${value.toLocaleString()} tokens` }))} />
          <fieldset><legend className="mb-2 text-xs font-medium text-[var(--muted)]">Rank for</legend><div className="grid grid-cols-3 rounded border border-[var(--line)] bg-[#111715] p-1">{objectives.map((option) => <button key={option} type="button" aria-pressed={objective === option} onClick={() => setObjective(option)} className={`min-h-8 rounded px-2 text-[11px] font-medium capitalize transition ${objective === option ? "bg-[#293532] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{option}</button>)}</div></fieldset>
          <div className="rounded border border-[var(--line)] bg-[#111] p-3"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><CircleHelp size={13} />Data policy</div><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">Exact benchmark fields are shown as measured. Missing fields use the saved predictors and are explicitly marked estimated. Supporting-row counts are empirical records, not a confidence probability.</p></div>
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        {result && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatTile label="GPU-budget matches" value={String(feasibleCount)} note={`of ${result.total_candidates_evaluated} estimates`} tone="green" /><StatTile label="Measured matches" value={String(observedCount)} note="Exact model/config/context" tone="blue" /><StatTile label="GPU VRAM budget" value={availableVram.toFixed(1)} suffix="GB" note="Predicted peak comparison" tone="amber" /><StatTile label="Throughput floor" value={minimumThroughput.toFixed(0)} suffix="tok/s" note={`${context} token context`} tone="red" /></div>}
        <Panel title="Configuration field" detail="All 36 options remain visible. Values are measured only when an exact benchmark exists; otherwise they are estimates.">
          <MessageState loading={!result && submitting} error={error} />
          {!result && !submitting && availableVram <= 0 && <p className="py-16 text-center text-sm text-[var(--muted)]">A positive VRAM budget is required before ranking configuration estimates.</p>}
          {result && <>
            {feasibleCount === 0 && <div className="mb-4 flex items-start gap-3 rounded border border-[#66552e] bg-[#2b2518] p-3"><Zap size={16} className="mt-0.5 shrink-0 text-[var(--amber)]" /><div><p className="text-xs font-semibold text-[#f1d58d]">No candidate estimate is below both selected thresholds. Closest stacks are still shown below.</p><p className="mt-1 text-[10px] leading-4 text-[#bbaa7b]">This is a GPU-only predicted-peak check, not a runtime verdict. Backend memory management, CUDA reservations, context-dependent allocations, and CPU/RAM offload can change whether a model runs. Estimates are not benchmark observations unless marked MEASURED.</p></div></div>}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex rounded border border-[var(--line)] bg-[#111] p-1" role="group" aria-label="Candidate filter">{(["all", "estimate-matches", "closest"] as Scope[]).map((item) => <button key={item} type="button" onClick={() => setScope(item)} aria-pressed={scope === item} className={`rounded px-3 py-1.5 text-[10px] font-medium ${scope === item ? "bg-[#333] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{item === "estimate-matches" ? "Estimate matches" : item}</button>)}</div><span className="text-[10px] tabular-nums text-[var(--muted)]">{shownRows.length} configurations · ranked {objective}</span></div>
            <div className="overflow-x-auto rounded border border-[var(--line)]">
              <table className="w-full min-w-[860px] border-collapse text-left text-[11px]">
                <thead className="bg-[#111]"><tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]"><th className="px-3 py-3">Model / source</th><th className="px-3 py-3">Stack</th><th className="px-3 py-3 text-right">Peak allocation</th><th className="px-3 py-3 text-right">Generation</th><th className="px-3 py-3 text-right">Supporting rows</th><th className="px-3 py-3 text-right">GPU budget check</th></tr></thead>
                <tbody>{shownRows.map((row) => {
                  const passes = row.fits_vram && row.meets_throughput;
                  return <tr key={`${row.model}-${row.precision}-${row.backend}`} className="border-b border-[var(--line)] last:border-0 hover:bg-[#222]">
                    <td className="px-3 py-3"><p className="font-semibold text-[var(--ink)]">{modelLabel(row.model, row.parameters_b)}</p><div className="mt-1 flex items-center gap-2"><Provenance row={row} /><span className="text-[9px] text-[var(--muted)]">{row.source_count} source rows</span></div></td>
                    <td className="max-w-[200px] px-3 py-3"><p className="font-medium text-[var(--ink)]">{row.precision} <span className="font-normal text-[var(--muted)]">/ {row.quantization}</span></p><p className="mt-1 truncate text-[9px] text-[var(--muted)]">{row.backend}</p></td>
                    <td className="px-3 py-3 text-right tabular-nums"><p className="font-semibold text-[var(--ink)]">{row.vram_source_type}: {row.predicted_vram_gb.toFixed(2)} GB</p><p className="mt-1 text-[9px] text-[var(--muted)]">MAE {row.vram_mae_gb.toFixed(1)} GB</p></td>
                    <td className="px-3 py-3 text-right tabular-nums"><p className="font-semibold text-[var(--ink)]">{row.throughput_source_type}: {row.predicted_generation_tok_s.toFixed(2)} tok/s</p><p className="mt-1 text-[9px] text-[var(--muted)]">MAE {row.throughput_mae_tok_s.toFixed(1)} tok/s</p></td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--muted)]">{row.source_count}</td>
                    <td className="px-3 py-3 text-right"><span className={`inline-flex min-w-[76px] items-center justify-center gap-1 rounded border px-2 py-1 text-[9px] font-semibold ${passes ? "border-[#555] bg-[#272727] text-white" : "border-[#66552e] bg-[#332c19] text-[#e3c475]"}`}>{passes && <Check size={11} />}{passes ? "Estimate within" : !row.fits_vram && !row.meets_throughput ? "Memory + speed" : !row.fits_vram ? "Above estimate" : "Below speed"}</span></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><CircleHelp size={13} className="mt-0.5 shrink-0" /><span>{result.warning} Source dataset: {result.training_dataset}. A supporting-row count is not a prediction interval; MAE is aggregate held-out error and does not guarantee per-request accuracy.</span></div>
          </>}
        </Panel>
      </div>
    </div>
  </>;
}
