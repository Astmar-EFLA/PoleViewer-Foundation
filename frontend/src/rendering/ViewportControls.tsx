import type { CSSProperties } from "react";
import type { FixedViewPreset } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 224,
  background: "rgba(255,255,255,0.92)",
  borderRadius: 6,
  padding: "8px 10px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
};

const PRESETS: { preset: FixedViewPreset; label: string }[] = [
  { preset: "top", label: "Top" },
  { preset: "front", label: "Front" },
  { preset: "side", label: "Side" },
  { preset: "isometric", label: "Iso" },
  { preset: "reset", label: "Fit all" },
];

export function ViewportControls() {
  const requestCameraPreset = useProjectStore((s) => s.requestCameraPreset);
  const horizontalClip = useProjectStore((s) => s.horizontalClip);
  const setHorizontalClipEnabled = useProjectStore((s) => s.setHorizontalClipEnabled);
  const setHorizontalClipElevation = useProjectStore((s) => s.setHorizontalClipElevation);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {PRESETS.map((p) => (
          <button
            key={p.preset}
            onClick={() => requestCameraPreset(p.preset)}
            style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="checkbox"
          checked={horizontalClip.enabled}
          onChange={(e) => setHorizontalClipEnabled(e.target.checked)}
        />
        Horizontal clip at
        <input
          type="number"
          step={0.5}
          value={horizontalClip.elevationLocalZ}
          disabled={!horizontalClip.enabled}
          onChange={(e) => setHorizontalClipElevation(Number(e.target.value))}
          style={{ width: 55 }}
        />
        m (local Z)
      </label>
    </div>
  );
}
