import { useEffect } from "react";
import { CoordinateReadout } from "../rendering/CoordinateReadout";
import { ErrorBoundary } from "../rendering/ErrorBoundary";
import { ReportModal } from "../rendering/ReportModal";
import { Scene } from "../rendering/Scene";
import { SectionPanel } from "../rendering/SectionPanel";
import { Toolbar } from "../rendering/Toolbar";
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
      <ErrorBoundary label="Toolbar">
        <Toolbar />
      </ErrorBoundary>
      <ErrorBoundary label="Sections panel">
        <SectionPanel />
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
