import { gravelPadThickness } from "../domain/fill";
import { excavationForPad, generateGravelPadBox, gravelPadVolumeM3 } from "../geometry/gravelPadGeometry";
import { useProjectStore } from "../state/projectStore";
import { validateGravelPadInstance } from "../validation/fillValidation";

const DESCRIPTION =
  "The gravel pad (malarpúði) each foundation sits on: a flat slab filling the whole excavation floor (pad + the " +
  "excavation's working space), top at the foundation base. The excavation floor follows its bottom -- changing the " +
  "thickness moves the excavation, not the foundation.";

/** The fill layer's panel -- the gravel pad. The uplift fill keeps the sloped-fill controls (UpliftFillPanel.tsx). */
export function FillPanel() {
  const project = useProjectStore((s) => s.project);
  const setFillStyle = useProjectStore((s) => s.setFillStyle);
  const setFillParameters = useProjectStore((s) => s.setFillParameters);

  if (!project) return null;
  const nowIso = project.modifiedAt;

  return (
    <div>
      <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 8 }}>{DESCRIPTION}</div>
      {project.fillInstances.map((pad) => {
        const foundation = project.foundationInstances.find((f) => f.instanceId === pad.foundationInstanceId);
        if (!foundation) return null;
        const results = validateGravelPadInstance(pad, foundation, nowIso);
        const blocked = results.some((r) => r.severity === "blocking");
        const box = generateGravelPadBox(pad, foundation, excavationForPad(pad, project.excavationInstances));

        return (
          <div key={pad.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={pad.visible}
                onChange={(e) => setFillStyle(pad.id, { visible: e.target.checked })}
              />
              {foundation.displayLabel}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={pad.opacity}
              disabled={!pad.visible}
              onChange={(e) => setFillStyle(pad.id, { opacity: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={pad.wireframe}
                onChange={(e) => setFillStyle(pad.id, { wireframe: e.target.checked })}
              />
              Wireframe
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>Thickness (m)</span>
              <input
                type="number"
                step={0.05}
                min={0}
                value={gravelPadThickness(pad)}
                onChange={(e) => setFillParameters(pad.id, { padThicknessM: Number(e.target.value) })}
                style={{ width: 70 }}
              />
            </label>
            <div style={{ opacity: 0.75, marginBottom: 4 }}>
              Top {pad.topElevationM.toFixed(2)} m (foundation base) · {(box.halfExtents.x * 2).toFixed(2)} ×{" "}
              {(box.halfExtents.y * 2).toFixed(2)} m
            </div>
            <div style={{ marginBottom: 4 }}>Volume: {blocked ? "-" : `${gravelPadVolumeM3(box).toFixed(2)} m3`}</div>

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
    </div>
  );
}
