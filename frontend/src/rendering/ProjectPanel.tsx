import type { CSSProperties } from "react";
import { useRef } from "react";
import { downloadProjectJson } from "../services/projectFile";
import type { AssetStatusState } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 610,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 320,
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

const buttonStyle: CSSProperties = {
  fontSize: 11,
  padding: "4px 9px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};

function assetStatusLine(status: AssetStatusState): { text: string; colour: string } {
  if (status.status === "loading") return { text: "Checking...", colour: "#666" };
  if (status.status === "error") return { text: `Could not reach backend: ${status.errorMessage}`, colour: "#c98a12" };
  if (status.status === "idle") return { text: "Not checked yet.", colour: "#666" };
  const result = status.result!;
  if (!result.exists) return { text: "Missing from the backend workspace.", colour: "#c02020" };
  return { text: `Present, hash ${result.sha256!.slice(0, 12)}...`, colour: "#2a8f3c" };
}

export function ProjectPanel() {
  const project = useProjectStore((s) => s.project);
  const assetStatus = useProjectStore((s) => s.assetStatus);
  const checkPointCloudAssetStatus = useProjectStore((s) => s.checkPointCloudAssetStatus);
  const cancelAssetStatusCheck = useProjectStore((s) => s.cancelAssetStatusCheck);
  const openProjectFromFile = useProjectStore((s) => s.openProjectFromFile);
  const projectFileLoad = useProjectStore((s) => s.projectFileLoad);
  const dismissProjectFileLoadError = useProjectStore((s) => s.dismissProjectFileLoadError);
  const setProjectNotes = useProjectStore((s) => s.setProjectNotes);
  const setReportOpen = useProjectStore((s) => s.setReportOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await openProjectFromFile(file);
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Project</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button style={buttonStyle} onClick={() => project && downloadProjectJson(project)}>
          Save project
        </button>
        <button style={buttonStyle} onClick={() => fileInputRef.current?.click()}>
          Open project
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => void handleFileChosen(e)}
        />
        <button style={buttonStyle} onClick={() => setReportOpen(true)}>
          Report
        </button>
      </div>

      {projectFileLoad.status === "error" && (
        <div style={{ background: "#fdeaea", border: "1px solid #e0a0a0", borderRadius: 4, padding: 6, marginBottom: 8 }}>
          <div style={{ color: "#c02020", fontWeight: 600, marginBottom: 2 }}>Could not open project file</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {projectFileLoad.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
          <button style={{ ...buttonStyle, marginTop: 4 }} onClick={dismissProjectFileLoadError}>
            Dismiss
          </button>
        </div>
      )}

      {project.pointCloudSource && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ opacity: 0.8, wordBreak: "break-all" }}>{project.pointCloudSource.filePath}</span>
            {assetStatus.status === "loading" ? (
              <button style={buttonStyle} onClick={cancelAssetStatusCheck}>
                Cancel
              </button>
            ) : (
              <button style={buttonStyle} onClick={() => void checkPointCloudAssetStatus()}>
                Check
              </button>
            )}
          </div>
          <div style={{ color: assetStatusLine(assetStatus).colour }}>{assetStatusLine(assetStatus).text}</div>
        </div>
      )}

      <label style={{ display: "block" }}>
        <span style={{ opacity: 0.8 }}>Notes</span>
        <textarea
          value={project.notes}
          onChange={(e) => setProjectNotes(e.target.value)}
          rows={3}
          style={{ width: "100%", fontFamily: "inherit", fontSize: 11, resize: "vertical" }}
          placeholder="Free-text project notes (not engineering-authoritative)."
        />
      </label>
    </div>
  );
}
