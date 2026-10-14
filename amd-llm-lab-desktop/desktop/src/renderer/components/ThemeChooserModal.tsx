import { Check, Sparkles, Sun, Moon, Flame, Palette } from "lucide-react";
import { useApp } from "../state";
import type { ThemeId } from "../../shared/types";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  category: "Light" | "Dark";
  headline: string;
  description: string;
  bgPreview: string;
  cardPreview: string;
  accentPreview: string;
  textColor: string;
  icon: typeof Sun;
  tag: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "cream",
    name: "Warm Cream",
    category: "Light",
    headline: "White & Cream Aesthetic",
    description: "Crisp white cards over soft warm cream tones with ember accents. Ultra-soothing for long sessions.",
    bgPreview: "#f8f5ee",
    cardPreview: "#ffffff",
    accentPreview: "#c2410c",
    textColor: "#28211b",
    icon: Sun,
    tag: "White & Cream",
  },
  {
    id: "white",
    name: "Studio White",
    category: "Light",
    headline: "Pure Studio Light",
    description: "Modern minimalist white with crisp contrast, slate navigation, and cool azure highlights.",
    bgPreview: "#f4f5f8",
    cardPreview: "#ffffff",
    accentPreview: "#007aff",
    textColor: "#171a1f",
    icon: Palette,
    tag: "Pure Light",
  },
  {
    id: "dark",
    name: "Midnight Obsidian",
    category: "Dark",
    headline: "Deep Charcoal & OLED",
    description: "Deep obsidian dark with charcoal surfaces and brilliant contrast. Perfect for dark rooms.",
    bgPreview: "#090a0f",
    cardPreview: "#14161f",
    accentPreview: "#0a84ff",
    textColor: "#f3f4f6",
    icon: Moon,
    tag: "OLED Dark",
  },
  {
    id: "cyber",
    name: "AMD Radeon Dark",
    category: "Dark",
    headline: "Signature Performance",
    description: "Stealth carbon dark chassis with authentic AMD Radeon red accents and high-tech glow.",
    bgPreview: "#0d0d12",
    cardPreview: "#16161d",
    accentPreview: "#ed1c24",
    textColor: "#f9fafb",
    icon: Flame,
    tag: "AMD Signature",
  },
];

export function ThemeChooserModal() {
  const { theme, setTheme, showThemeChooser, setShowThemeChooser } = useApp();

  if (!showThemeChooser) return null;

  const currentOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  const handleConfirm = () => {
    setTheme(theme, true);
  };

  return (
    <div className="sheet-back" style={{ alignItems: "center", zIndex: 100 }}>
      <div
        className="card"
        style={{
          width: "min(680px, 94vw)",
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          border: "1px solid var(--sep)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              color: "var(--accent)",
              padding: "4px 14px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            <Sparkles size={14} /> Appearance Setup
          </div>
          <h2 style={{ fontSize: 26, margin: "0 0 8px", fontWeight: 700 }}>Choose Your Workspace Theme</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14.5, maxWidth: "52ch", marginInline: "auto" }}>
            Select your preferred visual theme. You can switch between light white & cream and dark modes anytime from the header or Settings.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const Icon = opt.icon;
            return (
              <div
                key={opt.id}
                onClick={() => setTheme(opt.id, false)}
                style={{
                  background: opt.bgPreview,
                  color: opt.textColor,
                  border: isSelected ? `2.5px solid ${opt.accentPreview}` : "1px solid rgba(125,125,125,0.2)",
                  borderRadius: 18,
                  padding: 16,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  position: "relative",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  boxShadow: isSelected ? `0 6px 20px color-mix(in srgb, ${opt.accentPreview} 30%, transparent)` : "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: opt.accentPreview,
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{opt.name}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.75 }}>{opt.tag}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: opt.accentPreview,
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                </div>

                {/* Swatch mini preview card */}
                <div
                  style={{
                    background: opt.cardPreview,
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                    border: "1px solid rgba(125,125,125,0.15)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>Preview Card</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: opt.accentPreview,
                        color: "#fff",
                      }}
                    >
                      {opt.category}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(125,125,125,0.18)", borderRadius: 3, width: "70%", marginBottom: 6 }} />
                  <div style={{ height: 6, background: "rgba(125,125,125,0.12)", borderRadius: 3, width: "45%" }} />
                </div>

                <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.85 }}>{opt.description}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div className="dim" style={{ fontSize: 12.5 }}>
            Active preview: <strong>{currentOption.name}</strong> ({currentOption.category})
          </div>
          <button
            className="btn primary"
            onClick={handleConfirm}
            style={{ padding: "10px 24px", fontSize: 15, borderRadius: 12 }}
          >
            Apply & Launch AMD LLM Lab
          </button>
        </div>
      </div>
    </div>
  );
}
