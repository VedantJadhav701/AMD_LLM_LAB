"use client";

import { useState } from "react";
import { Sparkles, Check, AlertTriangle } from "lucide-react";
import { Panel, PageHeader, FieldNumber, FieldSelect, MessageState, formatModel } from "@/components/ui";
import { hubApi, type AdviseResponse } from "@/lib/hub-api";
import { GPUS, gpuOptions } from "@/lib/gpus";

const GOALS = [
  { value: "biggest_model", label: "Run the biggest model possible" },
  { value: "fastest", label: "Fastest decode throughput" },
  { value: "longest_context", label: "Maximum context window" },
];

export default function AdvisorPage() {
  const [gpuId, setGpuId] = useState("7900xtx");
  const [customVram, setCustomVram] = useState(24);
  const [context, setContext] = useState(2048);
  const [batch, setBatch] = useState(1);
  const [goal, setGoal] = useState<"biggest_model" | "fastest" | "longest_context">("biggest_model");
  const [minTokS, setMinTokS] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdviseResponse | null>(null);

  const gpu = GPUS.find((g) => g.id === gpuId) ?? GPUS[0];
  const vram = gpu.id === "custom" ? customVram : gpu.vram;

  async function getAdvice() {
    setLoading(true);
    setError(null);
    try {
      const res = await hubApi.advise({
        vram_gb: vram,
        gpu_name: gpu.id !== "custom" ? gpu.name : undefined,
        memory_bandwidth_gbps: gpu.bw || undefined,
        context_tokens: context,
        batch_size: batch,
        goal,
        min_decode_tok_s: minTokS > 0 ? minTokS : undefined,
      });
      setResult(res);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Could not get advice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Model Advisor"
        title="I have this GPU. What should I run?"
        detail="Tell the advisor your GPU memory, bandwidth, and goals. It evaluates architecture constraints, KV cache requirements, and real benchmark data to recommend optimal configurations."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="System & Constraints">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              getAdvice();
            }}
          >
            <FieldSelect label="Target GPU" value={gpuId} onChange={setGpuId} options={gpuOptions} />

            {gpuId === "custom" && (
              <FieldNumber label="Custom VRAM" value={customVram} onChange={setCustomVram} min={1} suffix="GB" />
            )}

            <FieldSelect label="Primary Goal" value={goal} onChange={(v) => setGoal(v as any)} options={GOALS} />

            <div className="grid grid-cols-2 gap-3">
              <FieldNumber label="Context length" value={context} onChange={setContext} min={128} step={512} suffix="tok" />
              <FieldNumber label="Batch size" value={batch} onChange={setBatch} min={1} suffix="seq" />
            </div>

            <FieldNumber label="Min generation speed (optional)" value={minTokS} onChange={setMinTokS} min={0} suffix="tok/s" />

            <button type="submit" disabled={loading} className="btn btn--solid mt-2 w-full justify-center">
              <Sparkles size={16} /> Get Model Advice
            </button>
          </form>
        </Panel>

        <div>
          <MessageState loading={loading} error={error} empty={!result ? "Fill in your target GPU and click 'Get Model Advice'." : undefined} />

          {result && (
            <Panel title="Recommended Configurations" detail={`${result.considered} combinations evaluated, ${result.options.length} top recommendations`}>
              <div className="space-y-4">
                {result.options.map((opt) => (
                  <div key={`${opt.model}-${opt.precision}`} className="border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-[var(--cyan)]">#{opt.rank} RECOMMENDATION</span>
                        <h3 className="text-lg font-semibold text-[var(--ink)]">{formatModel(opt.model)}</h3>
                        <p className="text-xs text-[var(--muted)]">{opt.params_b}B parameters · {opt.precision} precision</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold ${opt.verdict === "fits" ? "border-[#059669] text-[#34d399]" : "border-[#d97706] text-[#fbbf24]"}`}>
                        {opt.verdict === "fits" ? <Check size={13} /> : <AlertTriangle size={13} />}
                        {opt.verdict === "fits" ? "Fits GPU" : "Tight fit"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--line-soft)] pt-3 text-xs">
                      <div>
                        <span className="text-[var(--muted)]">VRAM Footprint</span>
                        <b className="block text-sm text-[var(--ink)]">{opt.total_gb} GB</b>
                      </div>
                      <div>
                        <span className="text-[var(--muted)]">Headroom</span>
                        <b className="block text-sm text-[var(--ink)]">{opt.headroom_gb} GB free</b>
                      </div>
                      <div>
                        <span className="text-[var(--muted)]">Max Context</span>
                        <b className="block text-sm text-[var(--ink)]">{opt.max_context_tokens.toLocaleString()} tok</b>
                      </div>
                    </div>

                    {opt.speed && (
                      <div className="mt-3 flex items-center justify-between border-t border-[var(--line-soft)] pt-2 text-xs">
                        <span className="text-[var(--muted)]">{opt.speed.note}</span>
                        <span className="font-semibold text-[var(--cyan)]">{opt.speed.tok_s} tok/s</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
