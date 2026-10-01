import { useState } from "react";
import { downloadCanvasScreenshot } from "../services/exportImage";
import { fileSafeName } from "../services/fileNames";
import { exportProjectAsGlb } from "../services/glbExport";
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
  const project = useProjectStore((s) => s.project);
  const projectName = project?.name;
  const selectedMastName = useProjectStore((s) =>
    s.lineImport.selectedMastIndex === null ? null : (s.lineImport.masts[s.lineImport.selectedMastIndex]?.mastName ?? null)
  );
  const [glbStatus, setGlbStatus] = useState<{ exporting: boolean; error: string | null }>({ exporting: false, error: null });

  function handleScreenshot() {
    if (!canvasElement) return;
    void downloadCanvasScreenshot(canvasElement, (projectName ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  }

  async function handleExportGlb() {
    if (!project) return;
    setGlbStatus({ exporting: true, error: null });
    try {
      // Named after the selected line mast when one is loaded (the same name the batch export uses).
      await exportProjectAsGlb(project, fileSafeName(selectedMastName ?? project.name, "model"));
      setGlbStatus({ exporting: false, error: null });
    } catch (error) {
      setGlbStatus({ exporting: false, error: (error as Error).message });
    }
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
        <button
          onClick={() => void handleExportGlb()}
          disabled={!project || glbStatus.exporting}
          title="Mast, foundations, terrain, excavations, fills and ground layers as a 3D model (local frame, mast centre at the origin)"
          style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: project ? "pointer" : "default" }}
        >
          {glbStatus.exporting ? "Exporting..." : "3D model (GLB)"}
        </button>
      </div>
      {glbStatus.error && <div style={{ color: "#c02020", fontSize: 10, marginBottom: 6 }}>{glbStatus.error}</div>}
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
