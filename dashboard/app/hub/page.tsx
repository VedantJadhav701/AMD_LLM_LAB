"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Panel, PageHeader, StatTile, FieldSelect, MessageState, formatModel } from "@/components/ui";
import { hubApi, type HubStats, type LeaderboardRow } from "@/lib/hub-api";

const COMMANDS = `pip install torch transformers   # use the ROCm build of PyTorch on AMD
python bench/rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --contexts 512,2048
# review amd_llm_lab_results.json, then share it:
python bench/rocm_bench.py --model Qwen/Qwen2.5-1.5B-Instruct --contexts 512,2048 --submit --api <hub-url>`;

export default function HubPage() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [model, setModel] = useState("");
  const [context, setContext] = useState(2048);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hubApi.stats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    let active = true;
    setRows(null);
    hubApi
      .leaderboard({ model: model || undefined, context })
      .then((data) => active && (setRows(data), setError(null)))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [model, context]);

  const top = rows && rows.length ? rows[0].decode_tok_s : 1;

  return (
    <>
      <PageHeader
        eyebrow="Community benchmarks"
        title="What do AMD GPUs really run?"
        detail="Measured results from real machines, ranked by decode speed. Every run keeps its stack, its memory phases and who vouches for it. Add yours with one command."
      />

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Runs" value={stats.submissions.toLocaleString()} note={`${stats.verified} verified, ${stats.community} community`} />
          <StatTile label="GPUs" value={String(stats.gpus.length)} note={stats.gpus.slice(0, 2).join(", ") || "none yet"} tone="green" />
          <StatTile label="Software stacks" value={String(stats.stacks.length)} note={stats.stacks.join(", ") || "none yet"} tone="blue" />
          <StatTile label="Models" value={String(stats.models.length)} note="Hugging Face ids" tone="amber" />
        </div>
      )}

      <Panel
        title="Leaderboard"
        detail="Median decode tokens per second at batch size 1"
        action={
          <div className="flex gap-3">
            <div className="w-44">
              <FieldSelect label="Model" value={model} onChange={setModel} options={[{ value: "", label: "All models" }, ...(stats?.models ?? []).map((m) => ({ value: m, label: formatModel(m) }))]} />
            </div>
            <div className="w-32">
              <FieldSelect label="Context" value={String(context)} onChange={(v) => setContext(Number(v))} options={(stats?.contexts.length ? stats.contexts : [2048]).map((c) => ({ value: String(c), label: `${c} tok` }))} />
            </div>
          </div>
        }
      >
        <MessageState error={error} loading={!error && rows === null} empty={rows && rows.length === 0 ? "No runs match. Try another model or context, or add one." : undefined} />
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[13px] text-[var(--muted)]">
                <tr className="border-b border-[var(--line)]">
                  {["GPU", "Model", "Stack", "Decode speed", "Memory", "Bandwidth used", "Runs", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.gpu}|${r.stack}|${r.model}|${r.precision}`} className="border-b border-[var(--line-soft)] align-middle">
                    <td className="px-3 py-3 font-medium">{r.gpu}</td>
                    <td className="px-3 py-3">{formatModel(r.model)} <span className="text-[var(--muted)]">{r.precision}</span></td>
                    <td className="px-3 py-3 text-[var(--ink-soft)]">{r.stack}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-14 tabular-nums font-semibold">{r.decode_tok_s.toFixed(1)}</span>
                        <span className="h-1.5 w-24 bg-[var(--surface-2)]"><span className="block h-full bg-[var(--cyan)]" style={{ width: `${(r.decode_tok_s / top) * 100}%` }} /></span>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.steady_vram_gb ?? r.run_peak_vram_gb ?? "–"} GB
                      <span className="block text-xs text-[var(--muted)]">{r.steady_vram_gb != null ? "steady" : "run peak"}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.efficiency != null ? `${Math.round(r.efficiency * 100)}%` : "–"}</td>
                    <td className="px-3 py-3 tabular-nums">{r.runs}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block border px-2 py-0.5 text-[11px] font-semibold ${r.verified ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-[#4b5057] text-[#aab0b6]"}`}>
                        {r.verified ? "Verified" : "Community"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Add your GPU" detail="Runs on your machine. Nothing is sent unless you add --submit.">
          <CodeBlock code={COMMANDS} />
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            The results file is plain JSON you can read first. It contains the GPU name, memory, ROCm and torch versions, OS name and
            the measured numbers. No prompts, paths or usernames.
          </p>
        </Panel>
        <Panel title="How to read the table">
          <ul className="grid gap-3 text-sm leading-relaxed text-[var(--ink-soft)]">
            <li><b className="text-white">Decode speed</b> is tokens per second while generating, with prefill timed separately and removed.</li>
            <li><b className="text-white">Memory</b> is split into steady (held once loaded) and run peak. Older reference runs only have run peak, which for quantized models includes the loading spike.</li>
            <li><b className="text-white">Bandwidth used</b> compares decode speed with the GPU’s published memory bandwidth. A low number means the software stack, not the hardware, is the limit.</li>
            <li><b className="text-white">Verified</b> runs are checked by a maintainer. Community runs pass automatic physics checks. Runs that fail them are held back.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <pre><code>{code}</code></pre>
      <button
        type="button"
        className="copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
