import { downloadCanvasScreenshot } from "../services/exportImage";
import type { FixedViewPreset } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

const PRESETS: { preset: FixedViewPreset; label: string }[] = [
  { preset: "top", label: "Top" },
  { preset: "front", label: "Front" },
  { preset: "side", label: "Side" },
  { preset: "isometric", label: "Iso" },
  { preset: "reset", label: "Fit all" },
];

/** Dropdown content only -- see LayerPanel.tsx's note; positioning comes from the DropdownButton in Toolbar.tsx. */
export function ViewportControls() {
  const requestCameraPreset = useProjectStore((s) => s.requestCameraPreset);
  const horizontalClip = useProjectStore((s) => s.horizontalClip);
  const setHorizontalClipEnabled = useProjectStore((s) => s.setHorizontalClipEnabled);
  const setHorizontalClipElevation = useProjectStore((s) => s.setHorizontalClipElevation);
  const canvasElement = useProjectStore((s) => s.canvasElement);
  const projectName = useProjectStore((s) => s.project?.name);

  function handleScreenshot() {
    if (!canvasElement) return;
    void downloadCanvasScreenshot(canvasElement, (projectName ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.preset}
            onClick={() => requestCameraPreset(p.preset)}
            style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={handleScreenshot}
          disabled={!canvasElement}
          style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: canvasElement ? "pointer" : "default" }}
        >
          Screenshot
        </button>
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
