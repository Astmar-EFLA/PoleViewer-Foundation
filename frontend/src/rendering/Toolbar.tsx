import type { CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";
import { DropdownButton } from "./DropdownButton";
import { ErrorBoundary } from "./ErrorBoundary";
import { ExcavationPanel } from "./ExcavationPanel";
import { FillPanel } from "./FillPanel";
import { FoundationPanel } from "./FoundationPanel";
import { UpliftFillPanel } from "./UpliftFillPanel";
import { GeotechPanel } from "./GeotechPanel";
import { LayerPanel } from "./LayerPanel";
import { LinePanel } from "./LinePanel";
import { MeasurementPanel } from "./MeasurementPanel";
import { ProjectPanel } from "./ProjectPanel";
import { TerrainPanel } from "./TerrainPanel";
import { ViewportControls } from "./ViewportControls";

const toolbarStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  zIndex: 30,
};

const toggleButtonStyle = (active: boolean): CSSProperties => ({
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 4,
  border: active ? "1px solid #3070e0" : "1px solid #ccc",
  background: active ? "#e8f0ff" : "#fff",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
});

/**
 * A single row of collapsed dropdown buttons replacing what used to be
 * eight permanently-open floating panels (each taking up real screen
 * space all the time, whether or not anyone was looking at it). Every
 * panel's own content is unchanged -- this only changes how much space
 * it takes up when nobody has opened it.
 */
export function Toolbar() {
  const project = useProjectStore((s) => s.project);
  const sectionsPanelOpen = useProjectStore((s) => s.sectionsPanelOpen);
  const setSectionsPanelOpen = useProjectStore((s) => s.setSectionsPanelOpen);
  const setReportOpen = useProjectStore((s) => s.setReportOpen);

  if (!project) return null;

  return (
    <div style={toolbarStyle}>
      <DropdownButton label="Layers" width={260}>
        <ErrorBoundary label="Layers panel">
          <LayerPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="View" width={280}>
        <ErrorBoundary label="Viewport controls">
          <ViewportControls />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Project" width={340}>
        <ErrorBoundary label="Project panel">
          <ProjectPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Line" width={360}>
        <ErrorBoundary label="Line panel">
          <LinePanel />
        </ErrorBoundary>
      </DropdownButton>
      {project.pointCloudSource && (
        <DropdownButton label="Terrain" width={280}>
          <ErrorBoundary label="Terrain panel">
            <TerrainPanel />
          </ErrorBoundary>
        </DropdownButton>
      )}
      <DropdownButton label="Foundations" width={300} maxHeight="60vh">
        <ErrorBoundary label="Foundation panel">
          <FoundationPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Geotech" width={320} maxHeight="55vh">
        <ErrorBoundary label="Geotechnical panel">
          <GeotechPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Excavations" width={300} maxHeight="55vh">
        <ErrorBoundary label="Excavation panel">
          <ExcavationPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Fill" width={300} maxHeight="55vh">
        <ErrorBoundary label="Fill panel">
          <FillPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Uplift fill" width={300} maxHeight="55vh">
        <ErrorBoundary label="Uplift fill panel">
          <UpliftFillPanel />
        </ErrorBoundary>
      </DropdownButton>
      <DropdownButton label="Measurements" width={320} maxHeight="50vh">
        <ErrorBoundary label="Measurements panel">
          <MeasurementPanel />
        </ErrorBoundary>
      </DropdownButton>
      <button
        type="button"
        onClick={() => setSectionsPanelOpen(!sectionsPanelOpen)}
        style={toggleButtonStyle(sectionsPanelOpen)}
      >
        Sections
      </button>
      <button type="button" onClick={() => setReportOpen(true)} style={toggleButtonStyle(false)}>
        Report
      </button>
    </div>
  );
}
