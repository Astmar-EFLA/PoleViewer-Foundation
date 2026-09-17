import type { CSSProperties } from "react";
import { useState } from "react";
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
  const registerOrthophoto = useProjectStore((s) => s.registerOrthophoto);
  const [imagePathInput, setImagePathInput] = useState("");

  if (!pointCloudSource || !clipBoundary) return null;

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
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Orthophoto (.jpg, with a matching .jgw beside it)</div>
        <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
          Workspace-relative or absolute path, same convention as a mast model's path. A world file carries no CRS
          -- the image is assumed to already be in the project's CRS.
        </div>
        {orthophoto && (
          <div style={{ opacity: 0.75, marginBottom: 4, wordBreak: "break-all" }}>
            Current: {orthophoto.imagePath} ({orthophoto.imageWidthPx}x{orthophoto.imageHeightPx}px)
          </div>
        )}
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <input
            type="text"
            value={imagePathInput}
            onChange={(e) => setImagePathInput(e.target.value)}
            placeholder="orthophoto.jpg"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            disabled={orthophotoRegistration.status === "loading" || !imagePathInput.trim()}
            onClick={() => void registerOrthophoto(imagePathInput.trim())}
            style={{ padding: "4px 8px", cursor: "pointer" }}
          >
            {orthophotoRegistration.status === "loading" ? "Registering..." : "Register"}
          </button>
        </div>
        {orthophotoRegistration.status === "error" && (
          <div style={{ color: "#c02020" }}>{orthophotoRegistration.errorMessage}</div>
        )}
        {orthophotoRegistration.warnings.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#c98a12" }}>
            {orthophotoRegistration.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
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
