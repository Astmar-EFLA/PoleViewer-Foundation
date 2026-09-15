import { useEffect } from "react";
import { CoordinateReadout } from "../rendering/CoordinateReadout";
import { ErrorBoundary } from "../rendering/ErrorBoundary";
import { ExcavationPanel } from "../rendering/ExcavationPanel";
import { FoundationPanel } from "../rendering/FoundationPanel";
import { GeotechPanel } from "../rendering/GeotechPanel";
import { LayerPanel } from "../rendering/LayerPanel";
import { MeasurementPanel } from "../rendering/MeasurementPanel";
import { ProjectPanel } from "../rendering/ProjectPanel";
import { ReportModal } from "../rendering/ReportModal";
import { Scene } from "../rendering/Scene";
import { SectionPanel } from "../rendering/SectionPanel";
import { TerrainPanel } from "../rendering/TerrainPanel";
import { ViewportControls } from "../rendering/ViewportControls";
import { buildSyntheticDemoProject } from "../services/buildSyntheticDemoProject";
import { useProjectStore } from "../state/projectStore";

export function App() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);

  useEffect(() => {
    setProject(buildSyntheticDemoProject());
  }, [setProject]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ErrorBoundary label="3D view">
        {project ? (
          <Scene project={project} />
        ) : (
          <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading synthetic demo project...</div>
        )}
      </ErrorBoundary>
      <ErrorBoundary label="Layers panel">
        <LayerPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Viewport controls">
        <ViewportControls />
      </ErrorBoundary>
      <ErrorBoundary label="Project panel">
        <ProjectPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Terrain panel">
        <TerrainPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Foundation panel">
        <FoundationPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Geotechnical panel">
        <GeotechPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Excavation panel">
        <ExcavationPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Sections panel">
        <SectionPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Measurements panel">
        <MeasurementPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Coordinate readout">
        <CoordinateReadout />
      </ErrorBoundary>
      <ErrorBoundary label="Report">
        <ReportModal />
      </ErrorBoundary>
    </div>
  );
}
