import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Flame, Palette, ChevronDown, Check } from "lucide-react";
import { useApp } from "../state";
import { THEME_OPTIONS } from "./ThemeChooserModal";
import type { ThemeId } from "../../shared/types";

export function ThemeSwitcher() {
  const { theme, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
  const Icon = current.icon;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("mousedown", onDocClick);
    }
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 30, ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties) }}>
      <button
        className="btn sm"
        onClick={() => setOpen((o) => !o)}
        title={`Current Theme: ${current.name} (Click to switch)`}
        style={{
          height: 28,
          padding: "3px 10px",
          borderRadius: 999,
          background: "var(--fill)",
          border: "1px solid var(--sep)",
          color: "var(--text)",
          fontSize: 12.5,
          fontWeight: 600,
          gap: 6,
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: current.accentPreview,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span>{current.name}</span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--card)",
            color: "var(--text)",
            border: "1px solid var(--sep)",
            borderRadius: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            padding: 6,
            minWidth: 190,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            zIndex: 100,
            animation: "rise 0.15s ease both",
          }}
        >
          <div style={{ padding: "6px 10px 4px", fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Select Theme
          </div>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setTheme(opt.id, true);
                  setOpen(false);
                }}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  background: isSelected ? "var(--fill)" : "transparent",
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: opt.bgPreview,
                      border: `1.5px solid ${opt.accentPreview}`,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: opt.accentPreview }} />
                  </div>
                  <span>{opt.name}</span>
                </div>
                {isSelected && <Check size={14} style={{ color: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
