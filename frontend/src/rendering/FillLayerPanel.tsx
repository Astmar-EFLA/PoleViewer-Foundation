import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { Project } from "../domain/project";
import type { ValidationResult } from "../domain/validation";
import type { FillGeometry } from "../geometry/fillGeometry";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { computeApproximateFillVolume } from "../geometry/fillVolume";
import { hasBlockingFillGeometryError } from "../validation/fillValidation";

interface FillLayerPanelProps {
  readonly project: Project;
  readonly description: string;
  readonly instances: readonly FillInstance[];
  readonly validate: (
    fill: FillInstance,
    foundation: FoundationInstance,
    geometry: FillGeometry | null,
    nowIso: string
  ) => ValidationResult[];
  readonly setStyle: (id: string, style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>) => void;
  readonly setParameters: (
    id: string,
    params: Partial<{ topElevationM: number; workingSpaceOffsetM: number; sideSlope: { h: number; v: number } }>
  ) => void;
}

/**
 * The shared control set both fill layers use -- the plain fill (reaching
 * up to a foundation's base) and the uplift-fill (covering the whole
 * foundation body). Identical UI either way; only which instances/actions/
 * validation function are passed in differs (see FillPanel.tsx /
 * UpliftFillPanel.tsx).
 */
export function FillLayerPanel({ project, description, instances, validate, setStyle, setParameters }: FillLayerPanelProps) {
  const nowIso = project.modifiedAt;

  return (
    <div>
      <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 8 }}>{description}</div>
      {instances.map((fill) => {
        const foundation = project.foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId);
        if (!foundation) return null;

        const geometry = project.terrainSurface
          ? generateFillGeometry(fill, foundation, project.terrainSurface)
          : null;
        const validationResults = validate(fill, foundation, geometry, nowIso);
        const geometryValid = !hasBlockingFillGeometryError(validationResults);
        const volume =
          geometry && project.terrainSurface
            ? computeApproximateFillVolume(fill, geometry, project.terrainSurface, geometryValid)
            : null;

        return (
          <div key={fill.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={fill.visible}
                onChange={(e) => setStyle(fill.id, { visible: e.target.checked })}
              />
              {foundation.displayLabel}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fill.opacity}
              disabled={!fill.visible}
              onChange={(e) => setStyle(fill.id, { opacity: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={fill.wireframe}
                onChange={(e) => setStyle(fill.id, { wireframe: e.target.checked })}
              />
              Wireframe
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>Top elevation</span>
              <input
                type="number"
                step={0.1}
                value={fill.topElevationM}
                onChange={(e) => setParameters(fill.id, { topElevationM: Number(e.target.value) })}
                style={{ width: 70 }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>Working space</span>
              <input
                type="number"
                step={0.1}
                min={0}
                value={fill.workingSpaceOffsetM}
                onChange={(e) => setParameters(fill.id, { workingSpaceOffsetM: Number(e.target.value) })}
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
                  value={fill.sideSlope.h}
                  onChange={(e) =>
                    setParameters(fill.id, { sideSlope: { ...fill.sideSlope, h: Number(e.target.value) } })
                  }
                  style={{ width: 45 }}
                />
                :
                <input
                  type="number"
                  step={0.1}
                  min={0.01}
                  value={fill.sideSlope.v}
                  onChange={(e) =>
                    setParameters(fill.id, { sideSlope: { ...fill.sideSlope, v: Number(e.target.value) } })
                  }
                  style={{ width: 45 }}
                />
              </span>
            </label>

            {geometry && (
              <div style={{ opacity: 0.75, marginBottom: 4 }}>
                Height: {geometry.minHeightM.toFixed(2)}-{geometry.maxHeightM.toFixed(2)} m
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
