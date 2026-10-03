"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Cpu,
  Github,
  HardDrive,
  Layers3,
  Menu,
  X,
} from "lucide-react";
import type { BenchmarkRecord } from "@/lib/types";
import { LandingScene } from "@/components/landing-scene";

const repo = "https://github.com/VedantJadhav701/AMD_LLM_LAB";

const steps = [
  {
    title: "Clone the repository",
    code: `git clone ${repo}.git\ncd AMD_LLM_LAB`,
  },
  {
    title: "Create a Python environment and install the backend",
    note: "Python 3.11 is the tested version.",
    code: `python -m venv .venv\n# Windows: .venv\\Scripts\\Activate.ps1\n# macOS/Linux: source .venv/bin/activate\npython -m pip install -r backend/requirements.txt`,
  },
  {
    title: "Start the FastAPI service",
    note: "API docs open at http://127.0.0.1:8000/docs",
    code: `cd backend\nuvicorn api.main:app --host 127.0.0.1 --port 8000 --reload`,
  },
  {
    title: "Start the dashboard",
    note: "Open http://localhost:3000. The dashboard finds the API on port 8000 by itself.",
    code: `# in a second terminal, from the repository root\ncd dashboard\nnpm install\nnpm run dev`,
  },
];

export default function LandingPage() {
  const [records, setRecords] = useState<BenchmarkRecord[]>([]);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/data/amd_llm_lab_master.json", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Public benchmark data could not be loaded.");
        return response.json() as Promise<BenchmarkRecord[]>;
      })
      .then((rows) => {
        if (active) {
          setRecords(rows);
          setDataState("ready");
        }
      })
      .catch(() => active && setDataState("error"));
    return () => {
      active = false;
    };
  }, []);

  const precisions = useMemo(() => [...new Set(records.map((row) => row.precision))], [records]);
  const modelSizes = [...new Set(records.map((row) => row.parameters_b))].filter(Number.isFinite).sort((a, b) => a - b);
  const contexts = [...new Set(records.map((row) => row.context_tokens))].filter(Number.isFinite).sort((a, b) => a - b);
  const models = [...new Set(records.map((row) => row.model))];
  const recordedVram = records[0]?.gpu_vram_gb;
  const speedRows = records.filter((row) => row.generation_tok_s != null);
  const ready = dataState === "ready";
  const vramRange = records.length
    ? `${Math.min(...records.map((row) => row.peak_vram_gb)).toFixed(2)} – ${Math.max(...records.map((row) => row.peak_vram_gb)).toFixed(2)}`
    : "–";
  const speedRange = speedRows.length
    ? `${Math.min(...speedRows.map((row) => row.generation_tok_s ?? Infinity)).toFixed(2)} – ${Math.max(...speedRows.map((row) => row.generation_tok_s ?? -Infinity)).toFixed(2)}`
    : "–";
  const pending = "Loading";

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-shell">
      <header className="lp-header">
        <div className="lp-header-in">
          <Link href="/" className="brand-lockup" aria-label="AMD LLM Lab home">
            <span className="amd-mark">
              AMD<span />
            </span>
            <span className="brand-divider" />
            <span className="brand-name">LLM Lab</span>
          </Link>

          <nav id="lp-nav" className={`lp-nav ${menuOpen ? "is-open" : ""}`} aria-label="Primary">
            <a href="#research" onClick={closeMenu}>Research</a>
            <a href="#measurements" onClick={closeMenu}>Benchmarks</a>
            <a href="#hardware" onClick={closeMenu}>Hardware</a>
            <a href="#setup" onClick={closeMenu}>Setup</a>
          </nav>

          <div className="lp-actions">
            <a className="icon-btn" href={repo} target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <Github size={18} />
            </a>
            <a href={repo} target="_blank" rel="noreferrer" className="btn">
              Enter the lab <ArrowUpRight size={16} />
            </a>
            <button
              type="button"
              className="icon-btn lp-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="lp-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: looping animation on the light stage */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Know how an LLM will run
              <em>before you run it.</em>
            </h1>
            <p className="hero-sub">
              Real MI300X measurements, prediction models and a hardware planner, together in one open research lab.
            </p>
            <div className="hero-actions">
              <a href={repo} target="_blank" rel="noreferrer" className="btn btn--solid">
                Enter the lab <ArrowUpRight size={17} />
              </a>
              <a href={repo} target="_blank" rel="noreferrer" className="btn">
                <Github size={17} /> View on GitHub
              </a>
            </div>
            <p className="hero-meta">
              {ready ? `${records.length} measured configurations on MI300X. ` : "Measured on MI300X. "}
              <a href="#setup">Run it locally</a>
            </p>
          </div>
          <LandingScene />
        </section>

        {/* Dataset summary */}
        <section className="data-strip" aria-label="Dataset summary">
          {dataState === "error" ? (
            <p className="data-note">
              The published measurement snapshot is unavailable. Open the GitHub repository to inspect the source dataset.
            </p>
          ) : (
            <>
              <div className="data-cell">
                <strong>{ready ? records.length.toLocaleString() : "…"}</strong>
                <span>Measured configurations</span>
              </div>
              <div className="data-cell">
                <strong>{ready ? models.length.toLocaleString() : "…"}</strong>
                <span>Models tested</span>
              </div>
              <div className="data-cell">
                <strong>{ready ? precisions.length.toLocaleString() : "…"}</strong>
                <span>Precision modes</span>
              </div>
              <div className="data-cell">
                <strong>{recordedVram == null ? "…" : `${recordedVram} GB`}</strong>
                <span>MI300X memory recorded</span>
              </div>
            </>
          )}
        </section>

        {/* Research */}
        <section id="research" className="section">
          <div className="split">
            <div>
              <h2>Model size is only the start.</h2>
              <p className="lede">
                Precision, context length and backend each move the operating envelope. The lab pairs real MI300X
                measurements with predictive modeling so you can see VRAM, throughput and hardware fit before you commit
                to a run.
              </p>
              <a className="link-arrow" href={repo} target="_blank" rel="noreferrer">
                Open the research workspace <ArrowRight size={16} />
              </a>
            </div>
            <dl className="vary" aria-label="Variables covered by the dataset">
              <div>
                <dt>Model size</dt>
                <dd>{modelSizes.length ? `${modelSizes[0]}B to ${modelSizes[modelSizes.length - 1]}B parameters` : pending}</dd>
              </div>
              <div>
                <dt>Precision</dt>
                <dd>{precisions.length ? precisions.join(", ") : pending}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{contexts.length ? `${contexts[0]} to ${contexts[contexts.length - 1]} tokens` : pending}</dd>
              </div>
              <div>
                <dt>Backend</dt>
                <dd>Multiple inference stacks</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Measurements */}
        <section id="measurements" className="section section--raised">
          <h2>Built from real measurements.</h2>
          <p className="lede">
            A read-only view of the benchmark dataset. Every observation keeps its source, so you can tell what was run
            from what was predicted.
          </p>
          <div className="measure">
            <article>
              <span className="provenance measured">Measured</span>
              <strong>{ready ? `${vramRange} GB` : "–"}</strong>
              <p>Peak VRAM across source rows</p>
            </article>
            <article>
              <span className="provenance measured">Measured</span>
              <strong>{ready ? speedRange : "–"}</strong>
              <p>Generation throughput, tokens per second</p>
            </article>
            <article className="measure-open">
              <Link href="/benchmarks">
                Open the benchmark explorer <ArrowUpRight size={22} />
              </Link>
              <p>Filter original runs by model, precision, context and backend.</p>
            </article>
          </div>
        </section>

        {/* What you can study */}
        <section className="section">
          <h2>Three ways to read the data.</h2>
          <div className="tiles">
            <article className="tile">
              <h3>Model scaling</h3>
              <p>Compare measured memory and generation speed as parameter count grows.</p>
              <Link href="/analytics">Explore scaling <ArrowRight size={16} /></Link>
            </article>
            <article className="tile">
              <h3>Precision</h3>
              <p>See how quantization and number formats change results across models and backends.</p>
              <Link href="/quantization">Explore precision <ArrowRight size={16} /></Link>
            </article>
            <article className="tile">
              <h3>Configuration</h3>
              <p>Find where context length and backend choice shift the measured performance envelope.</p>
              <Link href="/benchmarks">Explore benchmarks <ArrowRight size={16} /></Link>
            </article>
          </div>
        </section>

        {/* Hardware */}
        <section id="hardware" className="section section--raised">
          <div className="split">
            <div>
              <h2>What can your system run?</h2>
              <p className="lede">
                Start the local API and the lab reads your CPU, RAM and GPU, then compares them against MI300X-calibrated
                estimates. The hosted site can’t inspect your device, and estimates are not local runtime benchmarks.
              </p>
              <Link className="link-arrow" href="/device">
                Analyze my device <ArrowRight size={16} />
              </Link>
            </div>
            <div className="device">
              <div className="device-top">
                <b><Cpu size={16} /> Local device profile</b>
                <span>Needs the local app</span>
              </div>
              <div className="device-body">
                <h3>CPU, RAM, GPU and OS</h3>
                <p>Detected by FastAPI on your own machine after setup.</p>
                <div className="device-facts">
                  <DeviceFact icon={<HardDrive size={15} />} label="GPU memory" />
                  <DeviceFact icon={<Layers3 size={15} />} label="System RAM" />
                  <DeviceFact icon={<Cpu size={15} />} label="Processor" />
                </div>
              </div>
              <div className="device-foot">
                <span>Nothing leaves your machine.</span>
                <a href="#setup">See setup steps</a>
              </div>
            </div>
          </div>
        </section>

        {/* Provenance */}
        <section className="section">
          <h2>Measured is not estimated.</h2>
          <p className="lede">
            Every view labels where a number came from. Predictions can guide where to look next, but they never become
            benchmark records.
          </p>
          <div className="evidence">
            <article>
              <span className="provenance measured">Measured</span>
              <h3>Direct observation</h3>
              <p>Values recorded from a real run in the source dataset.</p>
            </article>
            <article>
              <span className="provenance estimated">Estimated</span>
              <h3>Predictor output</h3>
              <p>Model-based values for a configuration nobody has measured.</p>
            </article>
            <article>
              <span className="provenance interpolated">Interpolated</span>
              <h3>Between observations</h3>
              <p>A derived value supported by neighboring measured cases.</p>
            </article>
          </div>
        </section>

        {/* Open source */}
        <section id="project" className="oss">
          <h2 >Research you can inspect.</h2>
          <p>
            The benchmark dataset, trained predictors, FastAPI service, benchmark tooling and this dashboard are all in
            the public repository.
          </p>
          <div className="oss-actions">
            <a href={repo} target="_blank" rel="noreferrer" className="btn btn--solid">
              <Github size={17} /> Open the repository
            </a>
            <a href={repo} target="_blank" rel="noreferrer" className="btn">
              Enter the lab <ArrowUpRight size={16} />
            </a>
          </div>
          <ul className="stack" aria-label="What the repository contains">
            <li>Measurements</li>
            <li>Predictors</li>
            <li>FastAPI</li>
            <li>Next.js</li>
            <li>Reproducible runs</li>
          </ul>
        </section>

        {/* Setup */}
        <section id="setup" className="section">
          <div className="setup">
            <div className="setup-intro">
              <h2>Run it on your machine.</h2>
              <p className="lede">
                Four steps from clone to a working lab. Follow the steps below to clone the GitHub repository and run the full environment locally.
              </p>
              <div className="setup-cta">
                <a href={repo} target="_blank" rel="noreferrer" className="btn btn--solid">
                  Enter the lab <ArrowUpRight size={16} />
                </a>
                <a href={repo} target="_blank" rel="noreferrer" className="btn btn--ghost">
                  <Github size={17} /> GitHub
                </a>
              </div>
            </div>

            <div>
              <ol className="steps">
                {steps.map((step) => (
                  <li className="step" key={step.title}>
                    <h3>{step.title}</h3>
                    <CodeBlock code={step.code} />
                    {step.note && <p>{step.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <Link href="/" className="brand-lockup" aria-label="AMD LLM Lab home">
            <span className="amd-mark">
              AMD<span />
            </span>
            <span className="brand-divider" />
            <span className="brand-name">LLM Lab</span>
          </Link>
          <nav aria-label="Footer">
            <a href={repo} target="_blank" rel="noreferrer">Lab workspace</a>
            <Link href="/benchmarks">Benchmarks</Link>
            <Link href="/device">Hardware probe</Link>
            <a href={repo} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
        <small>
          AMD LLM Lab is an independent open-source research project and is not an official AMD product. AMD and the AMD
          arrow are trademarks of Advanced Micro Devices, Inc.
        </small>
      </footer>
    </div>
  );
}

function DeviceFact({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="device-fact">
      <span>
        {icon}
        {label}
      </span>
      <strong>Local probe</strong>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code">
      <pre>
        <code>{code}</code>
      </pre>
      <button type="button" className="copy" onClick={copy} aria-live="polite">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
