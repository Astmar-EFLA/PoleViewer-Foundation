import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { useProjectStore } from "../state/projectStore";

const SEVERITY_COLOUR: Record<string, string> = {
  information: "#3070e0",
  warning: "#c98a12",
  blocking: "#c02020",
};

function ClipField({
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
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 70 }}
      />
    </label>
  );
}

const clipFieldsStyle: CSSProperties = {
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: "1px solid #ddd",
};

export function TerrainPanel() {
  const pointCloudSource = useProjectStore((s) => s.project?.pointCloudSource);
  const clipBoundary = useProjectStore((s) => s.project?.terrainGenerationSettings.clipBoundary);
  const setClipBoundary = useProjectStore((s) => s.setClipBoundary);
  const regeneration = useProjectStore((s) => s.terrainRegeneration);
  const regenerate = useProjectStore((s) => s.regenerateTerrainFromPointCloud);
  const cancelRegeneration = useProjectStore((s) => s.cancelTerrainRegeneration);
  const orthophoto = useProjectStore((s) => s.project?.orthophoto);
  const orthophotoRegistration = useProjectStore((s) => s.orthophotoRegistration);
  const registerOrthophotoFromFiles = useProjectStore((s) => s.registerOrthophotoFromFiles);
  const fetchWorldImageryOrthophoto = useProjectStore((s) => s.fetchWorldImageryOrthophoto);
  const [orthophotoSelectionError, setOrthophotoSelectionError] = useState<string | null>(null);
  const orthophotoFileInputRef = useRef<HTMLInputElement>(null);
  const [worldImageryWidthM, setWorldImageryWidthM] = useState(400);
  const [worldImageryHeightM, setWorldImageryHeightM] = useState(400);

  if (!pointCloudSource || !clipBoundary) return null;

  async function handleOrthophotoFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const imageFile = files.find((f) => /\.jpe?g$/i.test(f.name));
    const worldFile = files.find((f) => /\.jgw$/i.test(f.name));
    if (files.length !== 2 || !imageFile || !worldFile) {
      setOrthophotoSelectionError("Select exactly one .jpg (or .jpeg) and its matching .jgw world file together.");
      return;
    }
    setOrthophotoSelectionError(null);
    await registerOrthophotoFromFiles(imageFile, worldFile);
  }

  return (
    <div>
      <div style={{ opacity: 0.75, marginBottom: 8, wordBreak: "break-all" }}>
        Source: {pointCloudSource.filePath}
      </div>

      <div style={clipFieldsStyle}>
        <div style={{ opacity: 0.8, marginBottom: 4 }}>
          Clip area (centred on the mast centre; takes effect on the next "Regenerate")
        </div>
        <ClipField label="Width (m)" value={clipBoundary.widthM} onChange={(v) => setClipBoundary({ widthM: v })} />
        <ClipField label="Length (m)" value={clipBoundary.lengthM} onChange={(v) => setClipBoundary({ lengthM: v })} />
        <ClipField
          label="Offset X (m)"
          value={clipBoundary.centerOffsetLocal.x}
          onChange={(v) => setClipBoundary({ centerOffsetLocal: { ...clipBoundary.centerOffsetLocal, x: v } })}
        />
        <ClipField
          label="Offset Y (m)"
          value={clipBoundary.centerOffsetLocal.y}
          onChange={(v) => setClipBoundary({ centerOffsetLocal: { ...clipBoundary.centerOffsetLocal, y: v } })}
        />
        <ClipField
          label="Rotation (deg)"
          value={(clipBoundary.rotationRadians * 180) / Math.PI}
          onChange={(v) => setClipBoundary({ rotationRadians: (v * Math.PI) / 180 })}
        />
      </div>

      <div style={clipFieldsStyle}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Orthophoto</div>
        <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
          Pick a .jpg and its matching .jgw world file together (ctrl/shift-click both in the file dialog). Uploaded
          into the backend's workspace, so it works regardless of which folder is currently configured as the
          workspace root. A world file carries no CRS -- the image is assumed to already be in the project's CRS.
        </div>
        {orthophoto && (
          <div style={{ opacity: 0.75, marginBottom: 4, wordBreak: "break-all" }}>
            Current: {orthophoto.imagePath} ({orthophoto.imageWidthPx}x{orthophoto.imageHeightPx}px)
          </div>
        )}
        <button
          type="button"
          disabled={orthophotoRegistration.status === "loading"}
          onClick={() => orthophotoFileInputRef.current?.click()}
          style={{ padding: "4px 8px", cursor: "pointer" }}
        >
          {orthophotoRegistration.status === "loading" ? "Uploading..." : "Choose orthophoto files (.jpg + .jgw)..."}
        </button>
        <input
          ref={orthophotoFileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.jgw"
          style={{ display: "none" }}
          onChange={(e) => void handleOrthophotoFilesChosen(e)}
        />
        {orthophotoSelectionError && <div style={{ color: "#c02020", marginTop: 4 }}>{orthophotoSelectionError}</div>}
        {orthophotoRegistration.status === "error" && (
          <div style={{ color: "#c02020", marginTop: 4 }}>{orthophotoRegistration.errorMessage}</div>
        )}
        {orthophotoRegistration.warnings.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#c98a12" }}>
            {orthophotoRegistration.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={clipFieldsStyle}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Esri World Imagery</div>
        <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
          Fetches satellite imagery centred on the mast, reprojected into the project's CRS. Requires internet
          access -- the only feature in this app that reaches an external server. Imagery: {"©"} Esri, Maxar,
          Earthstar Geographics, and the GIS User Community.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ opacity: 0.8 }}>Width (m)</span>
            <input
              type="number"
              step={50}
              min={1}
              value={worldImageryWidthM}
              onChange={(e) => setWorldImageryWidthM(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ opacity: 0.8 }}>Height (m)</span>
            <input
              type="number"
              step={50}
              min={1}
              value={worldImageryHeightM}
              onChange={(e) => setWorldImageryHeightM(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={orthophotoRegistration.status === "loading"}
          onClick={() => void fetchWorldImageryOrthophoto(worldImageryWidthM, worldImageryHeightM)}
          style={{ padding: "4px 8px", cursor: "pointer" }}
        >
          {orthophotoRegistration.status === "loading" ? "Fetching..." : "Fetch World Imagery"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={regeneration.status === "loading"}
          style={{ flex: 1, padding: "6px 8px", cursor: "pointer" }}
        >
          {regeneration.status === "loading" ? "Generating..." : "Regenerate from point cloud"}
        </button>
        {regeneration.status === "loading" && (
          <button type="button" onClick={cancelRegeneration} style={{ padding: "6px 8px", cursor: "pointer" }}>
            Cancel
          </button>
        )}
      </div>

      {regeneration.status === "error" && regeneration.errorMessage && (
        <div style={{ marginTop: 8, color: "#c02020" }}>{regeneration.errorMessage}</div>
      )}

      {regeneration.warnings.length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 16 }}>
          {regeneration.warnings.map((w, i) => (
            <li key={i} style={{ color: SEVERITY_COLOUR[w.severity] ?? "#333", marginBottom: 4 }}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {regeneration.status === "success" && regeneration.classificationCounts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Classification counts (clip)</div>
          {regeneration.classificationCounts.map((c) => (
            <div key={c.classificationCode}>
              class {c.classificationCode}: {c.pointCount}
            </div>
          ))}
        </div>
      )}

      {regeneration.status === "success" && regeneration.tinGenerationDurationMs !== null && (
        <div style={{ marginTop: 6, opacity: 0.6 }}>
          TIN build: {regeneration.tinGenerationDurationMs.toFixed(1)} ms
        </div>
      )}
    </div>
  );
}
