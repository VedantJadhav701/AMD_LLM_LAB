"use client";

import { useState } from "react";
import { Cpu, Ruler } from "lucide-react";
import { Panel, PageHeader, FieldNumber, FieldSelect, MessageState } from "@/components/ui";
import { hubApi, ApiError, type FitResponse, type Precision } from "@/lib/hub-api";
import { GPUS, gpuOptions } from "@/lib/gpus";

const EXAMPLES = ["Qwen/Qwen2.5-7B-Instruct", "meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3", "Qwen/Qwen2.5-32B-Instruct"];
const PRECISIONS = ["BF16", "FP16", "INT8", "INT4", "INT2"].map((p) => ({ value: p, label: p }));

const VERDICT = {
  fits: { text: "Fits", color: "#10b981" },
  tight: { text: "Tight", color: "#f59e0b" },
  does_not_fit: { text: "Does not fit", color: "#ef4444" },
} as const;

export default function FitPage() {
  const [modelId, setModelId] = useState("Qwen/Qwen2.5-7B-Instruct");
  const [precision, setPrecision] = useState<Precision>("BF16");
  const [context, setContext] = useState(4096);
  const [batch, setBatch] = useState(1);
  const [gpuId, setGpuId] = useState("7900xtx");
  const [customVram, setCustomVram] = useState(24);
  const [result, setResult] = useState<FitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);

  const gpu = GPUS.find((g) => g.id === gpuId) ?? GPUS[0];
  const vram = gpu.id === "custom" ? customVram : gpu.vram;

  async function detect() {
    setError(null);
    try {
      const local = await hubApi.localGpu();
      if (!local.gpu.available || !local.gpu.vram_gb) throw new ApiError("No GPU was detected on the machine running the API.");
      setGpuId("custom");
      setCustomVram(Math.round(local.gpu.vram_gb * 10) / 10);
      setDetected(local.gpu.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed.");
    }
  }

  async function check() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await hubApi.fit({
          hf_model_id: modelId.trim(),
          precision,
          context_tokens: context,
          batch_size: batch,
          device_vram_gb: vram,
          memory_bandwidth_gbps: gpu.bw || undefined,
        }),
      );
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const scale = result ? Math.max(result.total_gb, vram) : 1;
  const pct = (gb: number) => `${Math.min(100, (gb / scale) * 100)}%`;
  const verdict = result?.verdict ? VERDICT[result.verdict] : null;

  return (
    <>
      <PageHeader
        eyebrow="Memory fit"
        title="Will this model fit on your GPU?"
        detail="Enter any Hugging Face model. The lab reads its architecture, adds up weights, KV cache and runtime overhead, and tells you whether it fits and how much context you can afford."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="Your setup">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-[13px] text-[var(--muted)]">Hugging Face model</span>
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                required
                spellCheck={false}
                placeholder="owner/model-name"
                className="h-11 w-full border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-[var(--cyan)]"
              />
              <span className="mt-2 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setModelId(example)}
                    className="border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--cyan)] hover:text-white"
                  >
                    {example.split("/")[1]}
                  </button>
                ))}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <FieldSelect label="Precision" value={precision} onChange={(v) => setPrecision(v as Precision)} options={PRECISIONS} />
              <FieldNumber label="Context" value={context} onChange={setContext} min={1} step={512} suffix="tok" />
              <FieldNumber label="Batch size" value={batch} onChange={setBatch} min={1} />
            </div>

            <FieldSelect label="GPU" value={gpuId} onChange={setGpuId} options={gpuOptions} />
            {gpu.id === "custom" && <FieldNumber label="GPU memory" value={customVram} onChange={setCustomVram} min={1} step={1} suffix="GB" />}
            <button type="button" onClick={detect} className="flex items-center gap-2 text-left text-sm text-[var(--cyan)] hover:underline">
              <Cpu size={15} /> Detect the GPU on the machine running the API
            </button>
            {detected && <p className="-mt-2 text-xs text-[var(--muted)]">Detected {detected}.</p>}

            <button type="submit" disabled={loading} className="btn btn--solid mt-2">
              <Ruler size={16} /> {loading ? "Checking…" : "Check fit"}
            </button>
          </form>
        </Panel>

        <div className="grid min-w-0 content-start gap-6">
          <MessageState error={error} />
          {!result && !error && (
            <div className="border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--muted)]">
              Your result appears here. Nothing is stored.
            </div>
          )}
          {result && (
            <Panel title={result.model} detail={`${result.params_b}B parameters, read from ${result.params_source === "config" ? "the model config" : result.params_source}`}>
              {verdict && (
                <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="display text-[44px] font-semibold leading-none" style={{ color: verdict.color }}>
                    {verdict.text}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {result.total_gb.toFixed(1)} GB needed of {vram} GB
                    {result.headroom_gb !== null && (result.headroom_gb >= 0 ? `, ${result.headroom_gb.toFixed(1)} GB spare` : `, ${Math.abs(result.headroom_gb).toFixed(1)} GB short`)}
                  </span>
                </div>
              )}

              <div className="relative h-9 border border-[var(--line)] bg-[var(--surface-2)]" role="img" aria-label="Memory breakdown">
                <div className="flex h-full" style={{ width: pct(result.total_gb) }}>
                  <div style={{ width: pct(result.weights_gb), background: "var(--cyan)" }} title="Weights" />
                  <div style={{ width: pct(result.kv_cache_gb), background: "#7be3f3" }} title="KV cache" />
                  <div style={{ width: pct(result.overhead_gb), background: "#4b5057" }} title="Overhead" />
                </div>
                <div className="absolute inset-y-0 border-r-2 border-white" style={{ left: pct(vram) }} title={`GPU memory: ${vram} GB`} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Item swatch="var(--cyan)" label="Weights" value={`${result.weights_gb} GB`} />
                <Item swatch="#7be3f3" label="KV cache" value={`${result.kv_cache_gb} GB`} />
                <Item swatch="#4b5057" label="Overhead" value={`${result.overhead_gb} GB`} />
                <Item label="GPU memory" value={`${vram} GB`} />
              </dl>

              <div className="mt-6 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
                {result.max_context_tokens !== null && (
                  <Stat label="Longest context that fits" value={result.max_context_tokens > 0 ? `${result.max_context_tokens.toLocaleString()} tokens` : "None, the weights alone don't fit"} note={`at batch size ${batch}`} />
                )}
                {result.decode_tok_s_ceiling !== null && (
                  <Stat label="Decode speed ceiling" value={`${result.decode_tok_s_ceiling.toLocaleString()} tok/s`} note="Bandwidth limit, not a prediction. Real stacks reach a fraction." />
                )}
              </div>

              <ul className="mt-6 grid gap-2 border-t border-[var(--line)] pt-5 text-xs leading-relaxed text-[var(--muted)]">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-[var(--muted)]">
        {swatch && <span className="h-2.5 w-2.5" style={{ background: swatch }} />}
        {label}
      </dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-[13px] text-[var(--muted)]">{label}</p>
      <p className="display mt-1 text-[26px] font-semibold leading-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </div>
  );
}
