import { useProjectStore } from "../state/projectStore";

const SEVERITY_COLOUR: Record<string, string> = {
  information: "#3070e0",
  warning: "#c98a12",
  blocking: "#c02020",
};

export function TerrainPanel() {
  const pointCloudSource = useProjectStore((s) => s.project?.pointCloudSource);
  const regeneration = useProjectStore((s) => s.terrainRegeneration);
  const regenerate = useProjectStore((s) => s.regenerateTerrainFromPointCloud);
  const cancelRegeneration = useProjectStore((s) => s.cancelTerrainRegeneration);

  if (!pointCloudSource) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 6,
        padding: "10px 12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        width: 260,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Terrain (point cloud)</div>
      <div style={{ opacity: 0.75, marginBottom: 8, wordBreak: "break-all" }}>
        Source: {pointCloudSource.filePath}
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
