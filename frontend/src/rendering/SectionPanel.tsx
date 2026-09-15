import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { SectionMode } from "../domain/section";
import { generateSectionResult } from "../geometry/section";
import { radiansToDegrees, degreesToRadians } from "../geometry/angles";
import { useProjectStore } from "../state/projectStore";
import { SectionView } from "./SectionView";

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 420,
  maxHeight: "70vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

const MODE_LABELS: Record<SectionMode, string> = {
  longitudinal: "Longitudinal",
  transverse: "Transverse",
  leg: "Selected leg",
  custom: "Custom",
};

export function SectionPanel() {
  const project = useProjectStore((s) => s.project);
  const activeSectionId = useProjectStore((s) => s.activeSectionId);
  const setActiveSectionId = useProjectStore((s) => s.setActiveSectionId);
  const addSection = useProjectStore((s) => s.addSection);
  const updateSectionPlane = useProjectStore((s) => s.updateSectionPlane);
  const setSectionPointTolerance = useProjectStore((s) => s.setSectionPointTolerance);
  const setSectionVisible = useProjectStore((s) => s.setSectionVisible);
  const removeSection = useProjectStore((s) => s.removeSection);

  const activeSection = project?.sections.find((s) => s.id === activeSectionId) ?? null;

  const result = useMemo(() => {
    if (!project || !activeSection) return null;
    return generateSectionResult(project, activeSection);
  }, [project, activeSection]);

  if (!project) return null;

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Sections</div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {project.sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSectionId(s.id)}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 4,
              border: s.id === activeSectionId ? "1px solid #3070e0" : "1px solid #ccc",
              background: s.id === activeSectionId ? "#e8f0ff" : "#fff",
              cursor: "pointer",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button style={smallButtonStyle} onClick={() => addSection("leg", project.foundationInstances[0]?.legId ?? null)}>
          + Leg section
        </button>
        <button style={smallButtonStyle} onClick={() => addSection("custom", null)}>
          + Custom section
        </button>
      </div>

      {activeSection && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={activeSection.visible}
                onChange={(e) => setSectionVisible(activeSection.id, e.target.checked)}
              />
              Visible
            </label>
            <span style={{ opacity: 0.6 }}>{MODE_LABELS[activeSection.mode]}</span>
            {(activeSection.mode === "custom" || activeSection.mode === "leg") && (
              <button style={smallButtonStyle} onClick={() => removeSection(activeSection.id)}>
                Remove
              </button>
            )}
          </div>

          {activeSection.mode === "custom" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <label style={{ display: "flex", flexDirection: "column", fontSize: 10 }}>
                Origin X (m)
                <input
                  type="number"
                  step={0.5}
                  value={activeSection.plane.originX}
                  onChange={(e) =>
                    updateSectionPlane(activeSection.id, { ...activeSection.plane, originX: Number(e.target.value) })
                  }
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", fontSize: 10 }}>
                Origin Y (m)
                <input
                  type="number"
                  step={0.5}
                  value={activeSection.plane.originY}
                  onChange={(e) =>
                    updateSectionPlane(activeSection.id, { ...activeSection.plane, originY: Number(e.target.value) })
                  }
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", fontSize: 10 }}>
                Direction (deg)
                <input
                  type="number"
                  step={5}
                  value={radiansToDegrees(activeSection.plane.directionRadians).toFixed(1)}
                  onChange={(e) =>
                    updateSectionPlane(activeSection.id, {
                      ...activeSection.plane,
                      directionRadians: degreesToRadians(Number(e.target.value)),
                    })
                  }
                  style={{ width: 60 }}
                />
              </label>
            </div>
          )}

          <label style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ opacity: 0.8 }}>Point tolerance (m)</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={activeSection.pointToleranceM}
              onChange={(e) => setSectionPointTolerance(activeSection.id, Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>

          {activeSection.visible && result && (
            <SectionView result={result} mastCentreProjectElevation={project.mastCentreProject.elevation} width={392} height={280} />
          )}
        </>
      )}
    </div>
  );
}

const smallButtonStyle: CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};
