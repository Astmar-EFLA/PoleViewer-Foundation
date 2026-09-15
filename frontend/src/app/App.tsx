import { useEffect } from "react";
import { CoordinateReadout } from "../rendering/CoordinateReadout";
import { LayerPanel } from "../rendering/LayerPanel";
import { Scene } from "../rendering/Scene";
import { TerrainPanel } from "../rendering/TerrainPanel";
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
      <TerrainPanel />
      <CoordinateReadout />
    </div>
  );
}
