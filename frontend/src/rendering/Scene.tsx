import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { LocalFrameDefinition, ViewerFrameDefinition } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { Project } from "../domain/project";
import { localToProject, localToViewer } from "../geometry/coordinateTransform";
import { queryElevation } from "../geometry/terrain";
import { useProjectStore } from "../state/projectStore";
import { FoundationMeshes } from "./FoundationMeshes";
import { GroundPointsCloud } from "./GroundPointsCloud";
import { PoleAnchors } from "./PoleAnchors";
import { TerrainMesh } from "./TerrainMesh";

interface SceneProps {
  readonly project: Project;
}

export function Scene({ project }: SceneProps) {
  const setHover = useProjectStore((s) => s.setHover);

  const viewerFrame: ViewerFrameDefinition = { renderOriginLocal: project.renderOriginLocal };
  const localFrame: LocalFrameDefinition = {
    mastCentreProject: project.mastCentreProject,
    lineBearingRadians: project.lineBearingRadians,
  };

  function handleTerrainHover(localX: number, localY: number) {
    if (!project.terrainSurface) return;
    const query = queryElevation(project.terrainSurface, localX, localY);
    const localZ = query.elevation ?? 0;
    const local = localCoordinate(localX, localY, localZ);
    const viewer = localToViewer(local, viewerFrame);
    const projectCoord = localToProject(local, localFrame);

    setHover({
      viewer: { x: viewer.x, y: viewer.y, z: viewer.z },
      local,
      project: projectCoord,
      terrainQuerySource: query.source,
      terrainElevation: query.elevation,
    });
  }

  return (
    <Canvas camera={{ position: [30, 25, 30], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={0.8} />
      <gridHelper args={[100, 20]} />
      <axesHelper args={[5]} />

      {project.terrainSurface && (
        <>
          <TerrainMesh
            surface={project.terrainSurface}
            viewerFrame={viewerFrame}
            visible={project.layerStyles.terrain.visible}
            opacity={project.layerStyles.terrain.opacity}
            wireframe={project.layerStyles.terrain.wireframe}
            onHoverLocalXY={handleTerrainHover}
            onHoverEnd={() => setHover(null)}
          />
          <GroundPointsCloud
            surface={project.terrainSurface}
            viewerFrame={viewerFrame}
            visible={project.layerStyles.terrain.showPoints}
            opacity={project.layerStyles.terrain.opacity}
          />
        </>
      )}

      <PoleAnchors
        poleModel={project.poleModel}
        viewerFrame={viewerFrame}
        visible={project.layerStyles.pole.visible}
        opacity={project.layerStyles.pole.opacity}
      />

      <FoundationMeshes
        instances={project.foundationInstances}
        viewerFrame={viewerFrame}
        visible={project.layerStyles.foundations.visible}
        opacity={project.layerStyles.foundations.opacity}
      />

      <OrbitControls makeDefault />
    </Canvas>
  );
}
