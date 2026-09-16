import type { CSSProperties } from "react";
import { useMemo, useRef } from "react";
import type { SectionMode } from "../domain/section";
import { generateSectionResult } from "../geometry/section";
import { radiansToDegrees, degreesToRadians } from "../geometry/angles";
import { measureSync } from "../geometry/perf";
import { downloadSectionSvg, openSectionInNewWindow } from "../services/exportImage";
import { useProjectStore } from "../state/projectStore";
import { SectionView } from "./SectionView";

/**
 * Docked as a full-height right-hand sidebar, shown only when toggled open
 * (ViewportControls' "Sections" button) rather than as a permanent corner
 * widget -- the embedded diagram needs real room to be legible, and this
 * viewport already has more permanently-docked corner panels than a
 * 1280x680 window has space for without them overlapping.
 */
const panelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  bottom: 12,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 560,
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  zIndex: 50,
};

const MODE_LABELS: Record<SectionMode, string> = {
  longitudinal: "Longitudinal",
  transverse: "Transverse",
  leg: "Selected leg",
  custom: "Custom",
};

export function SectionPanel() {
  const project = useProjectStore((s) => s.project);
  const sectionsPanelOpen = useProjectStore((s) => s.sectionsPanelOpen);
  const setSectionsPanelOpen = useProjectStore((s) => s.setSectionsPanelOpen);
  const activeSectionId = useProjectStore((s) => s.activeSectionId);
  const setActiveSectionId = useProjectStore((s) => s.setActiveSectionId);
  const addSection = useProjectStore((s) => s.addSection);
  const updateSectionPlane = useProjectStore((s) => s.updateSectionPlane);
  const setSectionPointTolerance = useProjectStore((s) => s.setSectionPointTolerance);
  const setSectionVisible = useProjectStore((s) => s.setSectionVisible);
  const removeSection = useProjectStore((s) => s.removeSection);

  const activeSection = project?.sections.find((s) => s.id === activeSectionId) ?? null;
  const sectionContainerRef = useRef<HTMLDivElement>(null);

  const timedResult = useMemo(() => {
    if (!project || !activeSection) return null;
    // Phase 9 performance instrumentation: a section recomputes on every
    // relevant geometry change, so its cost is worth surfacing directly
    // rather than only inferring it from a laggy UI.
    return measureSync(() => generateSectionResult(project, activeSection));
  }, [project, activeSection]);
  const result = timedResult?.result ?? null;

  function handleExportSectionImage() {
    const svg = sectionContainerRef.current?.querySelector("svg");
    if (!svg || !activeSection) return;
    downloadSectionSvg(svg, activeSection.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  }

  function handleOpenInNewWindow() {
    const svg = sectionContainerRef.current?.querySelector("svg");
    if (!svg || !activeSection || !project) return;
    try {
      openSectionInNewWindow(svg, `${project.name} -- ${activeSection.name}`);
    } catch (error) {
      // window.open can be blocked by the browser's pop-up blocker on first
      // use -- surface that to the user rather than leaving it as a silent
      // console-only failure.
      window.alert((error as Error).message);
    }
  }

  if (!project || !sectionsPanelOpen) return null;

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Sections</div>
        <button style={smallButtonStyle} onClick={() => setSectionsPanelOpen(false)}>
          Close
        </button>
      </div>

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
            <span style={{ display: "flex", gap: 4 }}>
              <button style={smallButtonStyle} onClick={handleOpenInNewWindow}>
                Open in new window
              </button>
              <button style={smallButtonStyle} onClick={handleExportSectionImage}>
                Export image
              </button>
              {(activeSection.mode === "custom" || activeSection.mode === "leg") && (
                <button style={smallButtonStyle} onClick={() => removeSection(activeSection.id)}>
                  Remove
                </button>
              )}
            </span>
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
            <div ref={sectionContainerRef}>
              <SectionView
                result={result}
                mastCentreProjectElevation={project.mastCentreProject.elevation}
                width={532}
                height={440}
                resetViewKey={activeSection.id}
              />
              {timedResult && (
                <div style={{ opacity: 0.5, fontSize: 10, marginTop: 2 }}>
                  computed in {timedResult.durationMs.toFixed(1)} ms
                </div>
              )}
            </div>
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
