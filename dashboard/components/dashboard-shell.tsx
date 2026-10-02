"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Cpu, Database, Gauge, LayoutDashboard, Microscope, Server, Settings2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

const routes = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/predictor", label: "Predictor", icon: Gauge },
  { href: "/recommender", label: "Recommender", icon: Settings2 },
  { href: "/benchmarks", label: "Benchmarks", icon: Database },
  { href: "/device", label: "My Device", icon: Server },
  { href: "/quantization", label: "Quantization", icon: Microscope },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let active = true;
    const check = () => api.health().then(() => active && setApiStatus("online")).catch(() => active && setApiStatus("offline"));
    check();
    const interval = window.setInterval(check, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const activeRoute = routes.find((route) => route.href === pathname) ?? routes[0];
  const statusText = apiStatus === "online" ? "API connected" : apiStatus === "offline" ? "API offline" : "Connecting";
  const navLinks = (mobile = false) => routes.map(({ href, label, icon: Icon }) => {
    const selected = pathname === href;
    return <Link key={href} href={href} aria-current={selected ? "page" : undefined} className={`${mobile ? "shrink-0" : ""} flex items-center gap-2.5 rounded px-3 py-2.5 text-[12px] transition ${selected ? "bg-[#25332e] text-white" : "text-[#99a6a0] hover:bg-[#1a2420] hover:text-white"}`}><Icon size={15} strokeWidth={1.8} /><span>{label}</span>{selected && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--green)]" />}</Link>;
  });

  return <div className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="sticky top-0 hidden h-screen min-h-screen flex-col border-r border-[var(--line)] bg-[var(--sidebar)] px-3 py-4 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2" aria-label="AMD LLM Lab home"><span className="flex h-9 w-9 items-center justify-center rounded border border-[#643238] bg-[#361f22] text-[var(--red)]"><Cpu size={18} /></span><span><span className="block text-sm font-bold tracking-[0.04em] text-white">AMD LLM LAB</span><span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-[#899691]">Inference research</span></span></Link>
      <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#77847f]">Workspace</p><nav aria-label="Main navigation" className="grid gap-1">{navLinks()}</nav>
      <div className="mt-auto rounded border border-[var(--line)] bg-[#141b19] px-3 py-3"><div className="flex items-center gap-2 text-[11px] text-[#c4cecd]"><span className={`h-1.5 w-1.5 rounded-full ${apiStatus === "online" ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`} />MI300X benchmark host</div><p className="mt-1.5 pl-3.5 text-[9px] leading-4 text-[#8f9c9d]">57 measured records · {statusText}</p></div>
    </aside>
    <div className="min-w-0">
      <div className="border-b border-[var(--line)] bg-[var(--sidebar)] px-4 py-3 md:hidden"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded border border-[#643238] bg-[#361f22] text-[var(--red)]"><Cpu size={16} /></span><span className="text-sm font-bold">AMD LLM LAB</span><span className="ml-auto flex items-center gap-1.5 text-[9px] text-[var(--muted)]"><span className={`h-1.5 w-1.5 rounded-full ${apiStatus === "online" ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`} />{statusText}</span></div><nav aria-label="Main navigation" className="mt-3 flex gap-1 overflow-x-auto pb-0.5">{navLinks(true)}</nav></div>
      <header className="sticky top-0 z-20 hidden min-h-14 items-center justify-between gap-4 border-b border-[var(--line)] bg-[#101615]/95 px-4 backdrop-blur md:flex md:px-7"><div className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted)]"><Activity size={14} className="text-[var(--green)]" /><span>AMD LLM Lab</span><span className="text-[#53615c]">/</span><span className="truncate font-medium text-[var(--ink)]">{activeRoute.label}</span></div><div className="flex shrink-0 items-center gap-4 text-[10px]"><span className="flex items-center gap-1.5 text-[var(--muted)]"><span className={`h-1.5 w-1.5 rounded-full ${apiStatus === "online" ? "bg-[var(--green)]" : apiStatus === "offline" ? "bg-[var(--red)]" : "bg-[var(--amber)]"}`} />{statusText}</span><span className="hidden text-[var(--muted)] lg:block">Local research workspace</span><span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[var(--muted)]">v0.1.0</span></div></header>
      <main className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-5 md:px-7 md:py-7">{children}</main>
    </div>
  </div>;
}
