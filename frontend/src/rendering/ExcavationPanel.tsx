import type { CSSProperties } from "react";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { computeApproximateVolume } from "../geometry/excavationVolume";
import { useProjectStore } from "../state/projectStore";
import { hasBlockingExcavationGeometryError, validateExcavationInstance } from "../validation/excavationValidation";

const panelStyle: CSSProperties = {
  position: "absolute",
  bottom: 44,
  left: 328,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 280,
  maxHeight: "55vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

export function ExcavationPanel() {
  const project = useProjectStore((s) => s.project);
  const setExcavationStyle = useProjectStore((s) => s.setExcavationStyle);
  const setExcavationParameters = useProjectStore((s) => s.setExcavationParameters);

  if (!project) return null;
  const nowIso = project.modifiedAt;

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Excavations</div>

      {project.excavationInstances.map((excavation) => {
        const foundation = project.foundationInstances.find(
          (f) => f.instanceId === excavation.foundationInstanceId
        );
        if (!foundation) return null;

        const geometry = project.terrainSurface
          ? generateExcavationGeometry(excavation, foundation, project.terrainSurface)
          : null;
        const validationResults = validateExcavationInstance(excavation, foundation, geometry, nowIso);
        const geometryValid = !hasBlockingExcavationGeometryError(validationResults);
        const volume =
          geometry && project.terrainSurface
            ? computeApproximateVolume(excavation, geometry, project.terrainSurface, geometryValid)
            : null;

        return (
          <div key={excavation.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={excavation.visible}
                onChange={(e) => setExcavationStyle(excavation.id, { visible: e.target.checked })}
              />
              {foundation.legId}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={excavation.opacity}
              disabled={!excavation.visible}
              onChange={(e) => setExcavationStyle(excavation.id, { opacity: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={excavation.wireframe}
                onChange={(e) => setExcavationStyle(excavation.id, { wireframe: e.target.checked })}
              />
              Wireframe
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>Bottom elevation</span>
              <input
                type="number"
                step={0.1}
                value={excavation.bottomElevationM}
                onChange={(e) =>
                  setExcavationParameters(excavation.id, { bottomElevationM: Number(e.target.value) })
                }
                style={{ width: 70 }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>Working space</span>
              <input
                type="number"
                step={0.1}
                min={0}
                value={excavation.workingSpaceOffsetM}
                onChange={(e) =>
                  setExcavationParameters(excavation.id, { workingSpaceOffsetM: Number(e.target.value) })
                }
                style={{ width: 70 }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ opacity: 0.8 }}>Slope H:V</span>
              <span>
                <input
                  type="number"
                  step={0.1}
                  min={0.01}
                  value={excavation.sideSlope.h}
                  onChange={(e) =>
                    setExcavationParameters(excavation.id, {
                      sideSlope: { ...excavation.sideSlope, h: Number(e.target.value) },
                    })
                  }
                  style={{ width: 45 }}
                />
                :
                <input
                  type="number"
                  step={0.1}
                  min={0.01}
                  value={excavation.sideSlope.v}
                  onChange={(e) =>
                    setExcavationParameters(excavation.id, {
                      sideSlope: { ...excavation.sideSlope, v: Number(e.target.value) },
                    })
                  }
                  style={{ width: 45 }}
                />
              </span>
            </label>

            {geometry && (
              <div style={{ opacity: 0.75, marginBottom: 4 }}>
                Depth: {geometry.minDepthM.toFixed(2)}-{geometry.maxDepthM.toFixed(2)} m
              </div>
            )}

            {volume && (
              <div style={{ marginBottom: 4 }}>
                <div>
                  Approx. volume:{" "}
                  {volume.approximateVolumeM3 !== null ? `${volume.approximateVolumeM3.toFixed(1)} m3` : "-"}{" "}
                  <span style={{ opacity: 0.6 }}>({volume.status})</span>
                </div>
                {volume.status !== "calculated" && (
                  <div style={{ color: "#c02020", fontSize: 11 }}>
                    Volume blocked: {volume.truncatedByTerrainCoverage ? "terrain intersection is truncated" : "invalid geometry"}.
                  </div>
                )}
              </div>
            )}

            {validationResults.length > 0 && (
              <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                {validationResults.map((r, i) => (
                  <li key={i} style={{ color: r.severity === "blocking" ? "#c02020" : "#c98a12" }}>
                    {r.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
