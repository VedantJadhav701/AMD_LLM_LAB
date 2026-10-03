"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  Github,
  Layers,
  LayoutDashboard,
  Microscope,
  Ruler,
  Sparkles,
  Users,
  Server,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

const repo = "https://github.com/VedantJadhav701/AMD_LLM_LAB";

const primaryNav = [
  { href: "/lab", label: "Overview", icon: LayoutDashboard },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/fit", label: "Will it fit?", icon: Ruler },
  { href: "/hub", label: "Community", icon: Users },
  { href: "/benchmarks", label: "Benchmarks", icon: Database },
  { href: "/device", label: "Hardware", icon: Server },
  { href: "/analytics", label: "Research", icon: Microscope },
];

const secondaryNav = [
  { href: "/predictor", label: "Predictor", icon: Gauge, desc: "Size and throughput estimation" },
  { href: "/recommender", label: "Recommender", icon: Settings2, desc: "Constraint-driven planning" },
  { href: "/device", label: "My device", icon: Server, desc: "Local hardware evaluation" },
  { href: "/benchmarks", label: "MI300X", icon: Database, desc: "Raw measured benchmark data" },
  { href: "/quantization", label: "Quantization", icon: Layers, desc: "Precision and format analysis" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, desc: "Scaling and error validation" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [datasetRows, setDatasetRows] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname === "/") return;
    let active = true;
    const check = () =>
      api
        .health()
        .then((health) => {
          if (!active) return;
          setApiStatus("online");
          setDatasetRows(health.dataset_rows);
          setVersion(health.model_version);
        })
        .catch(() => active && setApiStatus("offline"));
    check();
    const interval = window.setInterval(check, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // The landing page renders its own header and footer.
  if (pathname === "/") return <>{children}</>;

  const statusText = apiStatus === "online" ? "API connected" : apiStatus === "offline" ? "API offline" : "Connecting";
  const dot = apiStatus === "online" ? "#10b981" : apiStatus === "offline" ? "#ef4444" : "#eab308";

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-bar">
          <Link href="/" className="app-brand brand-lockup" aria-label="AMD LLM Lab home">
            <span className="amd-mark" aria-hidden="true">
              AMD<span />
            </span>
            <span className="brand-divider" />
            <span className="brand-name">LLM Lab</span>
          </Link>

          <nav aria-label="Primary" className="app-nav">
            {primaryNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={`${href}-${label}`}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className="app-nav-item"
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}

            <div className="tools-wrap" ref={menuRef}>
              <button
                type="button"
                className="app-nav-item"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Gauge size={16} />
                Tools
                <ChevronDown size={14} style={{ transform: menuOpen ? "rotate(180deg)" : undefined, transition: "transform .15s ease" }} />
              </button>

              {menuOpen && (
                <div className="tools-menu">
                  <div className="tools-menu-title">Research and inference tools</div>
                  {secondaryNav.map(({ href, label, icon: Icon, desc }) => (
                    <Link
                      key={`sub-${href}-${label}`}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={pathname === href ? "page" : undefined}
                      className="tools-link"
                    >
                      <Icon size={16} />
                      <span>
                        <b>{label}</b>
                        <small>{desc}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="app-side">
            <span className="hw-tag">
              <Cpu size={14} style={{ color: "var(--cyan)" }} />
              Instinct MI300X, 192 GB HBM3
            </span>
            <div className="status-pill" role="status">
              <i style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
              <span>{statusText}</span>
              <hr />
              <span>{datasetRows == null ? "57 rows" : `${datasetRows} rows`}</span>
            </div>
            <span className="version-tag">{version ?? "v1.5.0"}</span>
            <a className="icon-btn" href={repo} target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <Github size={17} />
            </a>
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <div className="app-footer-in">
          <p>AMD LLM Lab is an independent open-source research platform, not an official AMD product.</p>
          <nav aria-label="Footer">
            <Link href="/lab">Overview</Link>
            <Link href="/benchmarks">Benchmarks</Link>
            <Link href="/device">Hardware</Link>
            <Link href="/predictor">Predictor</Link>
            <a href={repo} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
