"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, Database, Gauge, MemoryStick, Server, Zap } from "lucide-react";
import { api, modelLabel } from "@/lib/api";
import type { LocalHardwareInfo, RecommendationResponse, RecommendationRow } from "@/lib/types";
import { FieldNumber, FieldSelect, MessageState, PageHeader, StatTile } from "@/components/ui";

type PlanningBand = "GPU FIT" | "GPU TIGHT" | "OFFLOADABLE" | "NOT PRACTICAL";

export default function DevicePage() {
  const [device, setDevice] = useState<LocalHardwareInfo | null>(null);
  const [contexts, setContexts] = useState<number[]>([]);
  const [availableVram, setAvailableVram] = useState(0);
  const [context, setContext] = useState("");
  const [plan, setPlan] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.localHardware(), api.models()]).then(([profile, models]) => {
      if (!active) return;
      setDevice(profile);
      const observed = [...new Set(models.flatMap((model) => model.context_lengths))].sort((a, b) => a - b);
      setContexts(observed);
      if (observed.length) setContext(String(observed[0]));
      const capacity = profile.gpu.vram_free_gb ?? profile.gpu.vram_gb;
      if (capacity && capacity > 0) setAvailableVram(Number(capacity.toFixed(1)));
    }).catch((reason: Error) => active && setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (availableVram <= 0 || !context) return;
    api.recommend({ available_vram_gb: availableVram, minimum_throughput_tok_s: 0, context_tokens: Number(context), objective: "balanced" })
      .then((value) => active && setPlan(value)).catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [availableVram, context]);

  const candidates = useMemo(() => availableVram > 0 && context ? plan?.candidate_configurations ?? [] : [], [plan, availableVram, context]);
  const ordered = useMemo(() => [...candidates].sort((a, b) => bandOrder(classify(a, availableVram, device?.memory.available_gb ?? null)) - bandOrder(classify(b, availableVram, device?.memory.available_gb ?? null)) || b.predicted_generation_tok_s - a.predicted_generation_tok_s), [candidates, availableVram, device]);

  return <>
    <PageHeader eyebrow="Hardware / local profile" title="My Device" detail="Inspect the machine running the local FastAPI service and compare its reported resources with MI300X-calibrated estimates." action={<span className="inline-flex items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)]"><Server size={13} />{device?.host_scope ?? "Local host probe"}</span>} />
    <MessageState loading={loading} error={error} />
    {device && <>
      <div className="mb-6 grid gap-0 border-y border-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="GPU" value={device.gpu.available ? device.gpu.name ?? "Detected" : "Unavailable"} note={device.gpu.vendor ?? "GPU telemetry not exposed"} tone="red" />
        <StatTile label="VRAM capacity" value={device.gpu.vram_gb == null ? "Manual" : device.gpu.vram_gb.toFixed(1)} suffix={device.gpu.vram_gb == null ? undefined : "GB"} note={device.gpu.vram_free_gb == null ? "Set a planning budget below" : `${device.gpu.vram_free_gb.toFixed(1)} GB currently free`} tone="blue" />
        <StatTile label="System memory" value={device.memory.total_gb == null ? "n/a" : device.memory.total_gb.toFixed(1)} suffix={device.memory.total_gb == null ? undefined : "GB"} note={device.memory.available_gb == null ? "Available RAM unknown" : `${device.memory.available_gb.toFixed(1)} GB available`} tone="amber" />
        <StatTile label="CPU threads" value={String(device.cpu.logical_cores)} note={device.cpu.name} tone="green" />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <section className="border-t border-[var(--line)] pt-4">
          <p className="eyebrow">LOCAL FASTAPI HOST</p><h2 className="section-heading mt-2">Detected hardware</h2>
          <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            <HardwareLine icon={<Cpu size={16} />} label="Processor" value={device.cpu.name} detail={`${device.cpu.logical_cores} logical / ${device.cpu.physical_cores ?? "Unknown"} physical cores`} />
            <HardwareLine icon={<MemoryStick size={16} />} label="System memory" value={device.memory.total_gb == null ? "Unavailable" : `${device.memory.total_gb} GB`} detail={device.memory.available_gb == null ? "Free memory not reported" : `${device.memory.available_gb} GB currently available`} />
            <HardwareLine icon={<Gauge size={16} />} label="Graphics processor" value={device.gpu.name ?? "No supported GPU telemetry found"} detail={device.gpu.available ? `${device.gpu.vendor ?? "GPU"} / ${device.gpu.vram_gb ?? "VRAM unknown"} GB / ${device.gpu.detection_method}` : "VRAM can be entered manually if the runtime does not expose telemetry."} />
            <HardwareLine icon={<Server size={16} />} label="Platform" value={`${device.platform} / ${device.system} ${device.release}`} detail={`Probe scope: ${device.host_scope}`} />
          </div>
          <p className="mt-4 border-l-2 border-[var(--red)] pl-3 text-[10px] leading-5 text-[var(--muted)]">This is a planning aid, not a runtime-feasibility verdict. Predictors are calibrated on AMD Instinct MI300X measurements, not this local GPU. Actual execution depends on the inference backend, memory allocator, context and offload support.</p>
        </section>

        <section className="border-t border-[var(--line)] pt-4">
          <p className="eyebrow">CONFIGURATION PLANNING</p><h2 className="section-heading mt-2">What might fit your setup?</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">Predicted values remain estimates. Error bands and reported available RAM are shown to avoid treating one VRAM threshold as a definitive run/no-run answer.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <FieldNumber label="Available inference VRAM" value={availableVram} onChange={(value) => { setError(null); setAvailableVram(value); }} min={0} step={0.25} suffix="GB" />
            <FieldSelect label="Context length" value={context} onChange={(value) => { setError(null); setContext(value); }} options={contexts.map((value) => ({ value: String(value), label: `${value.toLocaleString()} tokens` }))} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-[var(--muted)]"><Database size={13} />{plan ? `${plan.total_candidates_evaluated} configurations estimated at ${Number(context).toLocaleString()} context.` : availableVram <= 0 ? "Enter a positive VRAM budget to request device-aware estimates." : "Estimates update automatically when you change the planning inputs."}</div>
          {error && <p role="alert" className="mt-3 border-l-2 border-[var(--red)] pl-3 text-xs text-[#ff969b]">{error}</p>}
          {ordered.length > 0 && <div className="mt-4 max-h-[540px] divide-y divide-[var(--line)] overflow-auto border-y border-[var(--line)]">
            {ordered.slice(0, 24).map((row) => <Candidate key={`${row.model}-${row.precision}-${row.backend}`} row={row} band={classify(row, availableVram, device.memory.available_gb)} />)}
          </div>}
          {plan && candidates.length === 0 && <p className="mt-4 text-xs leading-5 text-[var(--muted)]">The API returned no candidate estimates for this request. This is a predictor coverage limit, not a runtime feasibility verdict.</p>}
          {!plan && availableVram <= 0 && <div className="mt-4 border-y border-[var(--line)] py-5 text-xs text-[var(--muted)]">Hardware detection did not report a GPU memory budget. Enter one above to see model-based estimates.</div>}
          <p className="mt-3 text-[9px] leading-4 text-[var(--muted)]">GPU FIT: estimate plus its MAE is within budget. GPU TIGHT: estimate fits, but its error range crosses the budget. OFFLOADABLE: rough memory-headroom signal only, when predicted excess is below reported free RAM. NOT PRACTICAL: outside this GPU plus RAM planning envelope, not impossible to run. Offload behavior needs a real runtime test.</p>
          <a href="/recommender" className="mt-4 inline-flex h-9 items-center gap-2 bg-[var(--red)] px-3 text-xs font-semibold text-white transition hover:brightness-110"><Zap size={13} />Open full recommender</a>
        </section>
      </div>
    </>}
  </>;
}

function classify(row: RecommendationRow, gpuBudget: number, availableRam: number | null): PlanningBand {
  if (row.predicted_vram_gb + row.vram_mae_gb <= gpuBudget) return "GPU FIT";
  if (row.predicted_vram_gb <= gpuBudget) return "GPU TIGHT";
  if (availableRam != null && row.predicted_vram_gb - gpuBudget <= availableRam) return "OFFLOADABLE";
  return "NOT PRACTICAL";
}

function bandOrder(band: PlanningBand) { return band === "GPU FIT" ? 0 : band === "GPU TIGHT" ? 1 : band === "OFFLOADABLE" ? 2 : 3; }

function HardwareLine({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="flex gap-3 py-4"><span className="mt-0.5 text-[var(--red)]">{icon}</span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">{label}</p><p className="mt-1 break-words text-xs font-medium text-white">{value}</p><p className="mt-1 break-words text-[10px] leading-4 text-[var(--muted)]">{detail}</p></div></div>;
}

function Candidate({ row, band }: { row: RecommendationRow; band: PlanningBand }) {
  return <article className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold">{modelLabel(row.model, row.parameters_b)} / {row.precision}</p><span className={`planning-band ${band.toLowerCase().replaceAll(" ", "-")}`}>{band}</span></div><p className="mt-1 truncate text-[9px] text-[var(--muted)]">{row.backend} / {row.source_count} supporting rows / {row.source_type}</p><p className="mt-1 text-[9px] text-[var(--muted)]">VRAM estimate +/- {row.vram_mae_gb.toFixed(1)} GB MAE</p></div><span className="shrink-0 text-right text-[10px] tabular-nums text-[var(--muted)]">{row.predicted_vram_gb.toFixed(1)} GB<br />{row.predicted_generation_tok_s.toFixed(1)} tok/s</span></article>;
}
