import { Cpu, FlaskConical, History, Layers, ListChecks, Search, Settings as Cog } from "lucide-react";
import { useApp, type Page } from "./state";
import { CanRun } from "./pages/CanRun";
import { FitStudio } from "./pages/FitStudio";
import { HistoryPage } from "./pages/History";
import { Lab } from "./pages/Lab";
import { MachinePage } from "./pages/Machine";
import { Overview } from "./pages/Overview";
import { SettingsPage } from "./pages/Settings";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { ThemeChooserModal } from "./components/ThemeChooserModal";

type Item = [Page, string, typeof Cpu, string];
const GROUPS: Array<[string, Item[]]> = [
  ["Decide", [["overview", "Best for this laptop", ListChecks, "t-blue"], ["canrun", "Can I run it?", Search, "t-teal"], ["fit", "Fit Studio", Layers, "t-purple"]]],
  ["Test", [["lab", "Lab", FlaskConical, "t-green"], ["history", "History", History, "t-orange"]]],
  ["Device", [["machine", "My machine", Cpu, "t-gray"], ["settings", "Settings", Cog, "t-gray"]]],
];

export function App() {
  const { page, go, info } = useApp();
  const mac = info?.platform === "darwin";
  return (
    <div className="shell">
      <header className={`titlebar ${mac ? "mac" : "win"}`}>
        <div className="brand"><i /> AMD LLM Lab</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeSwitcher />
        </div>
      </header>
      <nav className="nav" aria-label="Main">
        {GROUPS.map(([title, items]) => (
          <div key={title} style={{ display: "contents" }}>
            <h6>{title}</h6>
            {items.map(([id, label, Icon, tile]) => (
              <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}>
                <span className={`tile ${tile}`}><Icon size={16} strokeWidth={2.2} /></span>{label}
              </button>
            ))}
          </div>
        ))}
        <div className="foot">Runs on this computer. Nothing is sent anywhere unless you share a result.<br />v{info?.version ?? ""} · Independent project, not an official AMD product.</div>
      </nav>
      <main className="main" id="main"><div className="wrap" key={page}>
        {page === "overview" && <Overview />}{page === "canrun" && <CanRun />}{page === "fit" && <FitStudio />}{page === "lab" && <Lab />}
        {page === "machine" && <MachinePage />}{page === "history" && <HistoryPage />}{page === "settings" && <SettingsPage />}
      </div></main>
      <ThemeChooserModal />
    </div>
  );
}

