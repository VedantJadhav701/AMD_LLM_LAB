import { Cpu, FlaskConical, History, ListChecks, Search, Settings as Cog } from "lucide-react";
import { useApp, type Page } from "./state";
import { CanRun } from "./pages/CanRun";
import { HistoryPage } from "./pages/History";
import { Lab } from "./pages/Lab";
import { MachinePage } from "./pages/Machine";
import { Overview } from "./pages/Overview";
import { SettingsPage } from "./pages/Settings";

const NAV: Array<[Page, string, typeof Cpu]> = [["overview", "Best for this laptop", ListChecks], ["canrun", "Can I run it?", Search], ["lab", "Lab", FlaskConical], ["machine", "My machine", Cpu], ["history", "History", History], ["settings", "Settings", Cog]];

export function App() {
  const { page, go, info } = useApp();
  const mac = info?.platform === "darwin";
  return (
    <div className="shell">
      <header className={`titlebar ${mac ? "mac" : "win"}`}><div className="brand"><i /> AMD LLM Lab</div><span className="sub">Independent open-source project</span></header>
      <nav className="nav" aria-label="Main">
        <h6>Decide</h6>
        {NAV.slice(0, 2).map(([id, label, Icon]) => <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}><Icon size={18} />{label}</button>)}
        <h6>Test</h6>
        {NAV.slice(2, 5).map(([id, label, Icon]) => <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}><Icon size={18} />{label}</button>)}
        <h6>App</h6>
        {NAV.slice(5).map(([id, label, Icon]) => <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}><Icon size={18} />{label}</button>)}
        <div className="foot">Runs entirely on this computer. Nothing is sent anywhere unless you choose to share a result.<br />v{info?.version ?? ""} · Not an official AMD product.</div>
      </nav>
      <main className="main" id="main"><div className="wrap">
        {page === "overview" && <Overview />}{page === "canrun" && <CanRun />}{page === "lab" && <Lab />}
        {page === "machine" && <MachinePage />}{page === "history" && <HistoryPage />}{page === "settings" && <SettingsPage />}
      </div></main>
    </div>
  );
}
