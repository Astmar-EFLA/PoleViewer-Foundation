import type { CSSProperties } from "react";
import { useRef } from "react";
import type { CoordinateReferenceSystem } from "../domain/coordinates";
import { downloadProjectJson } from "../services/projectFile";
import type { AssetStatusState } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

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

function formatCrs(crs: CoordinateReferenceSystem): string {
  if (crs.kind === "epsg") return `EPSG:${crs.epsgCode}`;
  if (crs.kind === "explicit") return crs.definition;
  return "unknown";
}

function CoordinateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <input
        type="number"
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 110 }}
      />
    </label>
  );
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
  const setMastCentreProject = useProjectStore((s) => s.setMastCentreProject);
  const setLineBearingRadians = useProjectStore((s) => s.setLineBearingRadians);
  const importPoleModelFromFile = useProjectStore((s) => s.importPoleModelFromFile);
  const poleModelImport = useProjectStore((s) => s.poleModelImport);
  const registerPointCloudFromFile = useProjectStore((s) => s.registerPointCloudFromFile);
  const pointCloudRegistration = useProjectStore((s) => s.pointCloudRegistration);

  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const poleModelFileInputRef = useRef<HTMLInputElement>(null);
  const pointCloudFileInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  async function handleProjectFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await openProjectFromFile(file);
  }

  async function handlePoleModelFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await importPoleModelFromFile(file);
  }

  async function handlePointCloudFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await registerPointCloudFromFile(file);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button style={buttonStyle} onClick={() => project && downloadProjectJson(project)}>
          Save project
        </button>
        <button style={buttonStyle} onClick={() => projectFileInputRef.current?.click()}>
          Open project
        </button>
        <input
          ref={projectFileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => void handleProjectFileChosen(e)}
        />
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

      <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
        <div style={{ opacity: 0.8, marginBottom: 4 }}>
          Mast centre ({formatCrs(project.crs)})
        </div>
        <CoordinateField
          label="Easting"
          value={project.mastCentreProject.easting}
          onChange={(v) => setMastCentreProject({ ...project.mastCentreProject, easting: v })}
        />
        <CoordinateField
          label="Northing"
          value={project.mastCentreProject.northing}
          onChange={(v) => setMastCentreProject({ ...project.mastCentreProject, northing: v })}
        />
        <CoordinateField
          label="Elevation"
          value={project.mastCentreProject.elevation}
          onChange={(v) => setMastCentreProject({ ...project.mastCentreProject, elevation: v })}
        />
        <CoordinateField
          label="Line bearing (deg)"
          value={(project.lineBearingRadians * 180) / Math.PI}
          onChange={(v) => setLineBearingRadians((v * Math.PI) / 180)}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Point cloud (.las, .laz)</div>
        {project.pointCloudSource && (
          <div style={{ marginBottom: 4 }}>
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
        <button
          style={buttonStyle}
          disabled={pointCloudRegistration.status === "loading"}
          onClick={() => pointCloudFileInputRef.current?.click()}
        >
          {pointCloudRegistration.status === "loading"
            ? "Uploading..."
            : project.pointCloudSource
              ? "Replace point cloud..."
              : "Choose point cloud file..."}
        </button>
        <input
          ref={pointCloudFileInputRef}
          type="file"
          accept=".las,.laz"
          style={{ display: "none" }}
          onChange={(e) => void handlePointCloudFileChosen(e)}
        />
        {pointCloudRegistration.status === "error" && (
          <div style={{ color: "#c02020", marginTop: 4 }}>{pointCloudRegistration.errorMessage}</div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Pole/tower model (.pol)</div>
        <button
          style={buttonStyle}
          disabled={poleModelImport.status === "loading"}
          onClick={() => poleModelFileInputRef.current?.click()}
        >
          {poleModelImport.status === "loading" ? "Importing..." : "Choose pole model file..."}
        </button>
        <input
          ref={poleModelFileInputRef}
          type="file"
          accept=".pol"
          style={{ display: "none" }}
          onChange={(e) => void handlePoleModelFileChosen(e)}
        />
        {poleModelImport.status === "error" && (
          <div style={{ color: "#c02020", marginTop: 4 }}>{poleModelImport.errorMessage}</div>
        )}
        {poleModelImport.status === "success" && (
          <div style={{ marginTop: 4 }}>
            <div style={{ color: "#2a8f3c" }}>
              Imported "{project.poleModel.name}" -- {project.poleModel.structuralLegs.length} leg(s), foundations
              and excavations rebuilt with defaults.
            </div>
            {poleModelImport.warnings.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#c98a12" }}>
                {poleModelImport.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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
