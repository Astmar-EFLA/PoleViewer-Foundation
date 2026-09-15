import { useEffect } from "react";
import { CoordinateReadout } from "../rendering/CoordinateReadout";
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
      {project ? (
        <Scene project={project} />
      ) : (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading synthetic demo project...</div>
      )}
      <LayerPanel />
      <ViewportControls />
      <ProjectPanel />
      <TerrainPanel />
      <FoundationPanel />
      <GeotechPanel />
      <ExcavationPanel />
      <SectionPanel />
      <MeasurementPanel />
      <CoordinateReadout />
      <ReportModal />
    </div>
  );
}
