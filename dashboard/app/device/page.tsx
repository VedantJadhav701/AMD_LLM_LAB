"use client";

import { useEffect, useState } from "react";
import { Cpu, Database, Gauge, MemoryStick, Server, Zap } from "lucide-react";
import { api, modelLabel } from "@/lib/api";
import type { LocalHardwareInfo, RecommendationResponse } from "@/lib/types";
import { FieldNumber, FieldSelect, MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

const contexts = [512, 1024, 2048, 4096, 8192];

export default function DevicePage() {
  const [device, setDevice] = useState<LocalHardwareInfo | null>(null);
  const [availableVram, setAvailableVram] = useState(8);
  const [context, setContext] = useState("4096");
  const [plan, setPlan] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.localHardware().then((profile) => {
      if (!active) return;
      setDevice(profile);
      const capacity = profile.gpu.vram_free_gb ?? (profile.gpu.vram_gb ? profile.gpu.vram_gb * 0.88 : null);
      if (capacity && capacity > 0) setAvailableVram(Number(capacity.toFixed(1)));
    }).catch((reason: Error) => setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.recommend({ available_vram_gb: availableVram, minimum_throughput_tok_s: 0, context_tokens: Number(context), objective: "balanced" })
      .then((value) => active && setPlan(value)).catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [availableVram, context]);

  const best = plan?.feasible_configurations.slice(0, 8) ?? [];
  return <>
    <PageHeader eyebrow="Hardware / local profile" title="My Device" detail="Inspect the machine running the local FastAPI service and see which benchmark-backed model stacks fit its memory budget." action={<span className="inline-flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)]"><Server size={13} />{device?.host_scope ?? "Local host probe"}</span>} />
    <MessageState loading={loading} error={error} />
    {device && <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="GPU" value={device.gpu.available ? device.gpu.name ?? "Detected" : "Unavailable"} note={device.gpu.vendor ?? "GPU telemetry not exposed"} tone="green" />
        <StatTile label="VRAM capacity" value={device.gpu.vram_gb == null ? "Manual" : device.gpu.vram_gb.toFixed(1)} suffix={device.gpu.vram_gb == null ? undefined : "GB"} note={device.gpu.vram_free_gb == null ? "Use planning budget below" : `${device.gpu.vram_free_gb.toFixed(1)} GB currently free`} tone="blue" />
        <StatTile label="System memory" value={device.memory.total_gb == null ? "n/a" : device.memory.total_gb.toFixed(1)} suffix={device.memory.total_gb == null ? undefined : "GB"} note={device.memory.available_gb == null ? "Available RAM unknown" : `${device.memory.available_gb.toFixed(1)} GB available`} tone="amber" />
        <StatTile label="CPU threads" value={String(device.cpu.logical_cores)} note={device.cpu.name} tone="red" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
        <Panel title="Local hardware profile" detail={`${device.platform} · probe scope is the FastAPI host process`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded border border-[var(--line)] bg-[#111715] p-4"><Cpu size={17} className="mt-0.5 shrink-0 text-[var(--green)]" /><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">Processor</p><p className="mt-2 text-sm font-semibold">{device.cpu.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{device.cpu.logical_cores} logical · {device.cpu.physical_cores ?? "?"} physical cores</p></div></div>
            <div className="flex gap-3 rounded border border-[var(--line)] bg-[#111715] p-4"><MemoryStick size={17} className="mt-0.5 shrink-0 text-[var(--blue)]" /><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">System memory</p><p className="mt-2 text-sm font-semibold">{device.memory.total_gb == null ? "Unavailable" : `${device.memory.total_gb} GB total`}</p><p className="mt-1 text-xs text-[var(--muted)]">{device.memory.available_gb == null ? "Free memory not reported" : `${device.memory.available_gb} GB available`}</p></div></div>
            <div className="flex gap-3 rounded border border-[var(--line)] bg-[#111715] p-4 sm:col-span-2"><Gauge size={17} className="mt-0.5 shrink-0 text-[var(--amber)]" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">Graphics processor</p><p className="mt-2 text-sm font-semibold">{device.gpu.name ?? "No supported GPU telemetry found"}</p><p className="mt-1 text-xs text-[var(--muted)]">{device.gpu.available ? `${device.gpu.vendor ?? "GPU"} · ${device.gpu.vram_gb ?? "VRAM unknown"} GB · detected by ${device.gpu.detection_method}` : "VRAM may be entered manually; browser and API runtimes do not always expose GPU memory."}</p></div></div>
          </div>
          <div className="mt-4 rounded border border-[#66552e] bg-[#2b2518] p-3 text-[11px] leading-5 text-[#d1c18f]">This compares predicted peak GPU allocation with the selected budget; it is not a runtime-feasibility verdict. Actual use depends on backend and CUDA memory management, context, and CPU/RAM offload. Throughput estimates are calibrated on AMD Instinct MI300X measurements, not this GPU.</div>
        </Panel>
        <Panel title="Device-aware model planning" detail="Use detected free memory when available, or enter a budget manually.">
          <FieldNumber label="Available inference VRAM" value={availableVram} onChange={setAvailableVram} min={0.25} step={0.25} suffix="GB" />
          <div className="mt-3"><FieldSelect label="Context length" value={context} onChange={setContext} options={contexts.map((value) => ({ value: String(value), label: `${value.toLocaleString()} tokens` }))} /></div>
          <div className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><Database size={13} className="mt-0.5 shrink-0" />{plan ? `${plan.feasible_count} GPU-budget matches across ${plan.total_candidates_evaluated} configurations at ${Number(context).toLocaleString()} context.` : "Checking configuration estimates."}</div>
          {best.length > 0 && <div className="mt-4 divide-y divide-[var(--line)] rounded border border-[var(--line)]">{best.map((row) => <div key={`${row.model}-${row.precision}-${row.backend}`} className="flex items-center justify-between gap-3 px-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{modelLabel(row.model, row.parameters_b)} · {row.precision}</p><p className="mt-1 truncate text-[9px] text-[var(--muted)]">{row.backend} · {row.source_type}</p></div><span className="shrink-0 text-right text-[10px] tabular-nums text-[var(--muted)]">{row.predicted_vram_gb.toFixed(1)} GB<br />{row.predicted_generation_tok_s.toFixed(1)} tok/s</span></div>)}</div>}
          {plan && best.length === 0 && <p className="mt-4 rounded border border-[var(--line)] bg-[#111715] p-3 text-xs leading-5 text-[var(--muted)]">No predicted peak allocation falls under this GPU budget at the selected context. That does not prove the model cannot run: try another backend or CPU/RAM offload, then validate with the target runtime. Review the closest estimates in Recommender.</p>}
          <a href="/recommender" className="mt-4 inline-flex h-9 items-center gap-2 rounded bg-[var(--green)] px-3 text-xs font-semibold text-[#09120f] transition hover:brightness-110"><Zap size={13} />Open full recommender</a>
        </Panel>
      </div>
    </>}
  </>;
}
