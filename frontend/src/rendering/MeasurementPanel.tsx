import type { CSSProperties } from "react";
import { useState } from "react";
import type { MeasurementKind } from "../domain/measurement";
import { useProjectStore } from "../state/projectStore";

const panelStyle: CSSProperties = {
  position: "absolute",
  bottom: 44,
  left: 620,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 300,
  maxHeight: "50vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

const POINT_TOOLS: { kind: MeasurementKind; label: string; points: 1 | 2 }[] = [
  { kind: "point-coordinate", label: "Point coordinate", points: 1 },
  { kind: "elevation", label: "Elevation", points: 1 },
  { kind: "depth-below-terrain", label: "Depth below terrain", points: 1 },
  { kind: "horizontal-distance", label: "Horizontal distance", points: 2 },
  { kind: "three-d-distance", label: "3D distance", points: 2 },
  { kind: "vertical-difference", label: "Vertical difference", points: 2 },
  { kind: "slope", label: "Slope", points: 2 },
];

function formatResult(value: number | null, unit: string): string {
  if (value === null) return "-";
  if (unit === "ratio") return `1:${value.toFixed(2)}`;
  return `${value.toFixed(3)} ${unit === "m" ? "m" : unit}`;
}

export function MeasurementPanel() {
  const project = useProjectStore((s) => s.project);
  const pendingMeasurement = useProjectStore((s) => s.pendingMeasurement);
  const startMeasurement = useProjectStore((s) => s.startMeasurement);
  const cancelMeasurement = useProjectStore((s) => s.cancelMeasurement);
  const addFoundationClearanceMeasurement = useProjectStore((s) => s.addFoundationClearanceMeasurement);
  const removeMeasurement = useProjectStore((s) => s.removeMeasurement);
  const recalculateMeasurement = useProjectStore((s) => s.recalculateMeasurement);

  const [clearanceLegId, setClearanceLegId] = useState<string>("");
  const [clearanceLayerId, setClearanceLayerId] = useState<string>("");

  if (!project) return null;

  const legId = clearanceLegId || project.foundationInstances[0]?.legId || "";

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Measurements</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {POINT_TOOLS.map((tool) => (
          <button
            key={tool.kind}
            onClick={() => startMeasurement(tool.kind)}
            disabled={pendingMeasurement !== null}
            style={{
              fontSize: 10,
              padding: "3px 6px",
              borderRadius: 4,
              border: pendingMeasurement?.kind === tool.kind ? "1px solid #3070e0" : "1px solid #ccc",
              background: pendingMeasurement?.kind === tool.kind ? "#e8f0ff" : "#fff",
              cursor: pendingMeasurement !== null ? "default" : "pointer",
            }}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {pendingMeasurement && (
        <div style={{ marginBottom: 8, padding: 6, background: "#fff6e0", borderRadius: 4 }}>
          Click the terrain to pick point {pendingMeasurement.points.length + 1} of{" "}
          {POINT_TOOLS.find((t) => t.kind === pendingMeasurement.kind)?.points ?? 1}.
          <button style={{ ...smallButtonStyle, marginLeft: 8 }} onClick={cancelMeasurement}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ borderTop: "1px solid #ddd", paddingTop: 6, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Foundation clearance</div>
        <select value={legId} onChange={(e) => setClearanceLegId(e.target.value)} style={{ width: "100%", marginBottom: 4 }}>
          {project.foundationInstances.map((f) => (
            <option key={f.legId} value={f.legId}>
              {f.legId}
            </option>
          ))}
        </select>
        <select
          value={clearanceLayerId}
          onChange={(e) => setClearanceLayerId(e.target.value)}
          style={{ width: "100%", marginBottom: 4 }}
        >
          <option value="">(default bearing layer)</option>
          {project.geotechLayers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            style={smallButtonStyle}
            onClick={() =>
              addFoundationClearanceMeasurement("foundation-to-bearing-layer", legId, clearanceLayerId || undefined)
            }
          >
            To bearing layer
          </button>
          <button
            style={smallButtonStyle}
            onClick={() => addFoundationClearanceMeasurement("foundation-to-groundwater", legId)}
          >
            To groundwater
          </button>
        </div>
      </div>

      <div>
        {project.measurements.length === 0 && <div style={{ opacity: 0.6 }}>No measurements yet.</div>}
        {project.measurements.map((m) => {
          const stale = m.geometryVersionAtCalculation !== project.geometryVersion;
          return (
            <div key={m.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #eee" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <span>{m.label}</span>
                <button style={smallButtonStyle} onClick={() => removeMeasurement(m.id)}>
                  x
                </button>
              </div>
              <div>
                {formatResult(m.resultValue, m.resultUnit)}
                {m.resultDetail && <span style={{ opacity: 0.7 }}> ({m.resultDetail})</span>}
              </div>
              {stale && (
                <div style={{ color: "#c07a12", display: "flex", alignItems: "center", gap: 6 }}>
                  Stale -- geometry has changed since this was calculated.
                  <button style={smallButtonStyle} onClick={() => recalculateMeasurement(m.id)}>
                    Recalculate
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const smallButtonStyle: CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};
