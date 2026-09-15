import type { CSSProperties } from "react";
import type { BoundaryDefinition } from "../domain/geotech";
import { useProjectStore } from "../state/projectStore";
import { validateGeotechLayer, validateGroundwaterFoundationIntersection } from "../validation/geotechValidation";

const panelStyle: CSSProperties = {
  position: "absolute",
  bottom: 44,
  left: 12,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 300,
  maxHeight: "55vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

function BoundaryEditor({
  label,
  boundary,
  onChange,
}: {
  label: string;
  boundary: BoundaryDefinition;
  onChange: (b: BoundaryDefinition) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={boundary.method}
          onChange={(e) => {
            const method = e.target.value as BoundaryDefinition["method"];
            onChange(
              method === "terrain-relative"
                ? { method: "terrain-relative", depthBelowTerrainM: 0 }
                : { method: "absolute-elevation", elevationProjectM: 0 }
            );
          }}
        >
          <option value="terrain-relative">Depth below terrain</option>
          <option value="absolute-elevation">Absolute project elevation</option>
        </select>
        {boundary.method === "terrain-relative" ? (
          <input
            type="number"
            step={0.1}
            value={boundary.depthBelowTerrainM}
            onChange={(e) => onChange({ method: "terrain-relative", depthBelowTerrainM: Number(e.target.value) })}
            style={{ width: 70 }}
          />
        ) : (
          <input
            type="number"
            step={0.1}
            value={boundary.elevationProjectM}
            onChange={(e) => onChange({ method: "absolute-elevation", elevationProjectM: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        )}
        <span style={{ opacity: 0.6 }}>m {boundary.method === "terrain-relative" ? "(depth)" : "(elevation)"}</span>
      </div>
    </div>
  );
}

export function GeotechPanel() {
  const project = useProjectStore((s) => s.project);
  const setGeotechLayerStyle = useProjectStore((s) => s.setGeotechLayerStyle);
  const setGeotechLayerBoundary = useProjectStore((s) => s.setGeotechLayerBoundary);
  const setGroundwaterStyle = useProjectStore((s) => s.setGroundwaterStyle);
  const setGroundwaterBoundary = useProjectStore((s) => s.setGroundwaterBoundary);

  if (!project) return null;

  const nowIso = project.modifiedAt;
  const mastElevation = project.mastCentreProject.elevation;

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Geotechnical / groundwater</div>

      {project.geotechLayers.map((layer) => {
        const results = project.terrainSurface
          ? validateGeotechLayer(layer, project.terrainSurface, mastElevation, nowIso)
          : [];
        return (
          <div key={layer.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(e) => setGeotechLayerStyle(layer.id, { visible: e.target.checked })}
              />
              {layer.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>({layer.category})</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={layer.opacity}
              disabled={!layer.visible}
              onChange={(e) => setGeotechLayerStyle(layer.id, { opacity: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={layer.wireframe}
                onChange={(e) => setGeotechLayerStyle(layer.id, { wireframe: e.target.checked })}
              />
              Wireframe
            </label>

            <BoundaryEditor
              label="Top boundary"
              boundary={layer.topBoundary}
              onChange={(b) => setGeotechLayerBoundary(layer.id, "top", b)}
            />
            <BoundaryEditor
              label="Bottom boundary"
              boundary={layer.bottomBoundary}
              onChange={(b) => setGeotechLayerBoundary(layer.id, "bottom", b)}
            />

            <div style={{ opacity: 0.6 }}>Source: {layer.source.verificationState}</div>

            {results.length > 0 && (
              <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                {results.map((r, i) => (
                  <li key={i} style={{ color: r.severity === "blocking" ? "#c02020" : "#c98a12" }}>
                    {r.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {project.groundwater && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={project.groundwater.visible}
              onChange={(e) => setGroundwaterStyle({ visible: e.target.checked })}
            />
            {project.groundwater.name}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={project.groundwater.opacity}
            disabled={!project.groundwater.visible}
            onChange={(e) => setGroundwaterStyle({ opacity: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
          <BoundaryEditor
            label="Water table"
            boundary={project.groundwater.boundary}
            onChange={(b) => setGroundwaterBoundary(b)}
          />

          {project.terrainSurface &&
            project.foundationInstances.map((f) => {
              const results = validateGroundwaterFoundationIntersection(
                project.groundwater!,
                f,
                project.terrainSurface!,
                mastElevation,
                nowIso
              );
              return results.map((r, i) => (
                <div key={`${f.instanceId}-${i}`} style={{ color: "#c98a12", marginTop: 4 }}>
                  {r.detail}
                </div>
              ));
            })}
        </div>
      )}
    </div>
  );
}
