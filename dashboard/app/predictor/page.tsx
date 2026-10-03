"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Gauge, Info } from "lucide-react";
import { api, modelLabel } from "@/lib/api";
import type { ApiConfiguration, ModelInfo, PredictionResponse } from "@/lib/types";
import { FieldSelect, MessageState, PageHeader, Panel, StatTile } from "@/components/ui";

const keyOf = (config: ApiConfiguration) => `${config.precision}|${config.quantization}|${config.backend}`;

export default function PredictorPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [configurations, setConfigurations] = useState<ApiConfiguration[]>([]);
  const [parameters, setParameters] = useState("7.615");
  const [context, setContext] = useState("4096");
  const [configurationKey, setConfigurationKey] = useState("");
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contexts = useMemo(() => models[0]?.context_lengths ?? [], [models]);

  useEffect(() => {
    Promise.all([api.models(), api.metadata()])
      .then(([modelData, metadata]) => {
        setModels(modelData);
        if (modelData.length) setParameters(String(modelData[0].parameters_b));
        const availableContexts = modelData[0]?.context_lengths ?? [];
        if (availableContexts.length) setContext(String(availableContexts[0]));
        const configData = metadata.recommender_metadata.configurations;
        setConfigurations(configData);
        if (configData.length) setConfigurationKey(keyOf(configData[0]));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedConfig = useMemo(() => configurations.find((config) => keyOf(config) === configurationKey) ?? configurations[0], [configurations, configurationKey]);
  const optionsFor = (field: keyof ApiConfiguration) => [...new Set(configurations.filter((item) => item.precision === selectedConfig?.precision).map((item) => item[field]))].map((option) => ({ value: option, label: option }));

  function setConfigField(field: keyof ApiConfiguration, value: string) {
    if (!selectedConfig) return;
    const matched = field === "precision"
      ? configurations.find((candidate) => candidate.precision === value)
      : configurations.find((candidate) => candidate.precision === selectedConfig.precision && candidate[field] === value);
    if (matched) setConfigurationKey(keyOf(matched));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConfig) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.predict({
        parameters_b: Number(parameters),
        context_tokens: Number(context),
        ...selectedConfig,
      }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Model inference estimate" title="Predictor" detail="Configuration-aware throughput with a size-based VRAM baseline and empirical error ranges." />
      <MessageState loading={loading} error={error && !result ? error : null} />
      {!loading && <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <Panel title="Inference configuration" detail="Qwen2.5 benchmark coverage spans 0.5B to 32.76B and contexts up to 8,192 tokens.">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <FieldSelect label="Model size" value={parameters} onChange={setParameters} options={models.map((model) => ({ value: String(model.parameters_b), label: modelLabel(model.model, model.parameters_b) }))} />
            <FieldSelect label="Context length" value={context} onChange={setContext} options={contexts.map((value) => ({ value: String(value), label: `${value.toLocaleString()} tokens` }))} />
            <FieldSelect label="Precision" value={selectedConfig?.precision ?? ""} onChange={(value) => setConfigField("precision", value)} options={[...new Set(configurations.map((item) => item.precision))].map((value) => ({ value, label: value }))} />
            <FieldSelect label="Quantization" value={selectedConfig?.quantization ?? ""} onChange={(value) => setConfigField("quantization", value)} options={optionsFor("quantization")} />
            <div className="sm:col-span-2"><FieldSelect label="Inference backend" value={selectedConfig?.backend ?? ""} onChange={(value) => setConfigField("backend", value)} options={optionsFor("backend")} /></div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={submitting || !selectedConfig} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-[var(--red)] px-4 text-sm font-semibold text-white transition hover:bg-[#bd2029] disabled:hover:bg-[var(--red)]">
                <Gauge size={16} />{submitting ? "Estimating..." : "Run estimate"}<ArrowRight size={15} />
              </button>
            </div>
          </form>
          {error && result && <p role="alert" className="mt-4 rounded border border-[#643238] bg-[#2a1c1d] p-3 text-sm text-[#ff8589]">{error}</p>}
        </Panel>

        {result ? <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold uppercase text-[var(--green)]"><span className="h-2 w-2 rounded-full bg-[var(--green)]" />{result.source_type}</span>
            <span className="text-xs text-[var(--muted)]">Model {result.model_version} · {result.source_count} supporting rows</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile label={`${result.vram_source_type === "measured" ? "Measured" : "Estimated"} peak VRAM`} value={result.prediction.vram_gb.toFixed(2)} suffix="GB" note={result.vram_source_type === "measured" ? "Exact benchmark field" : `Held-out model MAE ±${result.uncertainty.vram_mae_gb.toFixed(2)} GB`} tone="blue" />
            <StatTile label={`${result.throughput_source_type === "measured" ? "Measured" : "Estimated"} generation`} value={result.prediction.throughput_tok_s.toFixed(2)} suffix="tok/s" note={result.throughput_source_type === "measured" ? "Exact benchmark field" : `Held-out model MAE ±${result.uncertainty.throughput_mae_tok_s.toFixed(2)} tok/s`} tone="green" />
          </div>
          <Panel title="Result provenance" detail={result.source_type === "measured" ? "Both values are taken from an exact measured benchmark row." : "Each value is labeled with its own source. A measured value is a direct row from the CSV; an estimated value comes from saved predictors."}>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-3 text-xs">
              <dt className="text-[var(--muted)]">Source type</dt><dd className="font-medium uppercase text-[var(--ink)]">{result.source_type}</dd>
              <dt className="text-[var(--muted)]">Source ID</dt><dd className="break-all font-medium text-[var(--ink)]">{result.source_id}</dd>
              <dt className="text-[var(--muted)]">VRAM provenance</dt><dd className="font-medium uppercase text-[var(--ink)]">{result.vram_source_type}</dd>
              <dt className="text-[var(--muted)]">Throughput provenance</dt><dd className="font-medium uppercase text-[var(--ink)]">{result.throughput_source_type}</dd>
              <dt className="text-[var(--muted)]">Model version</dt><dd className="font-medium text-[var(--ink)]">{result.model_version}</dd>
              <dt className="text-[var(--muted)]">Training data</dt><dd className="break-all font-medium text-[var(--ink)]">{result.training_dataset}</dd>
            </dl>
          </Panel>
          <div className="flex gap-2 rounded-md border border-[#66552e] bg-[#2b2518] p-3 text-xs leading-5 text-[#d1c18f]"><Info size={15} className="mt-0.5 shrink-0" /><span>{result.source_type === "measured" ? "An exact benchmark row exists for this model, configuration, and context. " : "No direct benchmark exists for this exact configuration; this output is not a measured benchmark. "}{result.uncertainty.vram_guidance} {result.uncertainty.throughput_guidance}{result.uncertainty.extrapolation_warning && ` ${result.uncertainty.extrapolation_warning}`}</span></div>
          </div> : <Panel title="Estimate output" detail="Output provenance and empirical model errors appear here."><div className="flex min-h-[320px] flex-col items-center justify-center text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded border border-[var(--line)] bg-[#202b28] text-[var(--blue)]"><Gauge size={20} /></div><p className="text-sm font-medium text-[var(--ink)]">No estimate yet</p><p className="mt-1 max-w-[260px] text-xs leading-5 text-[var(--muted)]">Choose a configuration and run the predictor.</p></div></Panel>}
      </div>}
    </>
  );
}
