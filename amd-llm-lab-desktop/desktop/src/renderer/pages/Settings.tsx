import { useEffect, useState } from "react";
import { api, useApp } from "../state";
import { THEME_OPTIONS } from "../components/ThemeChooserModal";
import { Check, Palette, Sparkles } from "lucide-react";

export function SettingsPage() {
  const { settings, saveSettings, info, theme, setTheme, setShowThemeChooser } = useApp();
  const [runtime, setRuntime] = useState(""); const [hub, setHub] = useState(""); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (settings) { setRuntime(settings.customRuntimeUrl); setHub(settings.hubUrl); } }, [settings]);
  if (!settings) return null;
  const save = async (p: Parameters<typeof saveSettings>[0]) => { try { await saveSettings(p); setMsg("Saved"); } catch (e) { setMsg((e as Error).message); } setTimeout(() => setMsg(null), 2500); };
  return (<>
    <div className="eyebrow">Settings</div><h1>Settings</h1>
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="card stack">
        <div className="row between">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Palette size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)" }}>Appearance & Theme</h3>
          </div>
          <button className="btn sm ghost" onClick={() => setShowThemeChooser(true)} style={{ fontSize: 12 }}>
            <Sparkles size={13} /> Open Welcome Chooser
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setTheme(opt.id, true)}
                style={{
                  background: opt.bgPreview,
                  color: opt.textColor,
                  border: isSelected ? `2px solid ${opt.accentPreview}` : "1px solid rgba(125,125,125,0.2)",
                  borderRadius: 14,
                  padding: 12,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  position: "relative",
                  boxShadow: isSelected ? `0 4px 14px color-mix(in srgb, ${opt.accentPreview} 25%, transparent)` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: opt.accentPreview }} />
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{opt.name}</span>
                  </div>
                  {isSelected && <Check size={14} strokeWidth={3} style={{ color: opt.accentPreview }} />}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.8, lineHeight: 1.4 }}>
                  {opt.headline}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card stack">
        <label className="f">Default context window<select value={settings.defaultCtx} onChange={(e) => save({ defaultCtx: Number(e.target.value) })}>{[2048, 4096, 8192, 16384, 32768].map((c) => <option key={c} value={c}>{c.toLocaleString()} tokens</option>)}</select></label>
        <label className="f">Memory used for conversation history<select value={settings.kvPrecision} onChange={(e) => save({ kvPrecision: e.target.value as "f16" | "q8_0" })}><option value="f16">Standard (f16)</option><option value="q8_0">Compressed (q8_0, about half the memory)</option></select></label>
      </div>
      <div className="card stack">
        <label className="f">Another local server address<input placeholder="http://127.0.0.1:5000" value={runtime} onChange={(e) => setRuntime(e.target.value)} /></label>
        <div className="dim" style={{ fontSize: 13 }}>Any OpenAI-compatible server on this computer. Only localhost addresses are accepted.</div>
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => save({ customRuntimeUrl: runtime })}>Save</button>
      </div>
      <div className="card stack">
        <label className="f">Community hub address (optional)<input placeholder="https://your-hub.example.com/api" value={hub} onChange={(e) => setHub(e.target.value)} /></label>
        <div className="dim" style={{ fontSize: 13 }}>Nothing is ever sent automatically. You review the exact data before each submission.</div>
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => save({ hubUrl: hub })}>Save</button>
      </div>
      {msg ? <div className="flag info">{msg}</div> : null}
      <div className="card">
        <h3>About</h3>
        <p className="muted" style={{ margin: 0 }}>AMD LLM Lab {info?.version} · independent open-source project, not an official AMD product. No telemetry. Data folder: <span className="mono">{info?.userData}</span></p>
        <div className="row" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => api.invoke("app:openExternal", "https://github.com/VedantJadhav701/AMD_LLM_LAB")}>GitHub</button></div>
      </div>
    </div>
  </>);
}
