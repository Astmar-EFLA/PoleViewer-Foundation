import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LocalFrameDefinition, ViewerFrameDefinition } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { Project } from "../domain/project";
import { localToProject, localToViewer } from "../geometry/coordinateTransform";
import { queryElevation } from "../geometry/terrain";
import type { FixedViewPreset } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";
import { ExcavationMesh } from "./ExcavationMesh";
import { FoundationMeshes } from "./FoundationMeshes";
import { GeotechLayers } from "./GeotechLayers";
import { GroundPointsCloud } from "./GroundPointsCloud";
import { GroundwaterSurface } from "./GroundwaterSurface";
import { MeasurementMarkers } from "./MeasurementMarkers";
import { PoleAnchors } from "./PoleAnchors";
import { PoleMembersMesh } from "./PoleMembersMesh";
import { TerrainContours } from "./TerrainContours";
import { TerrainMesh } from "./TerrainMesh";

interface SceneProps {
  readonly project: Project;
}

const DEFAULT_CAMERA_DISTANCE = 40;

const CAMERA_PRESETS: Record<FixedViewPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  top: { position: [0, DEFAULT_CAMERA_DISTANCE, 0.01], target: [0, 0, 0] },
  front: { position: [0, 0, DEFAULT_CAMERA_DISTANCE], target: [0, 0, 0] },
  side: { position: [DEFAULT_CAMERA_DISTANCE, 0, 0], target: [0, 0, 0] },
  isometric: { position: [30, 25, 30], target: [0, 0, 0] },
  reset: { position: [30, 25, 30], target: [0, 0, 0] },
};

/** Runs inside the Canvas (needs R3F context) -- applies camera-preset requests issued from the HTML overlay (ViewportControls) via the store, since that panel lives outside the Canvas tree. */
function CameraRig() {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const request = useProjectStore((s) => s.cameraPresetRequest);

  useEffect(() => {
    if (!request) return;
    const { position, target } = CAMERA_PRESETS[request.preset];
    camera.up.set(0, 1, 0);
    camera.position.set(...position);
    camera.lookAt(...target);
    const controls = controlsRef.current as { target: THREE.Vector3; update: () => void } | null;
    if (controls) {
      controls.target.set(...target);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return <OrbitControls ref={controlsRef} makeDefault />;
}

/** Runs inside the Canvas -- publishes the underlying WebGL canvas DOM element to the store once, so an HTML overlay button (ViewportControls, outside the Canvas tree) can capture a screenshot of it (spec section 20: "screenshot export"). */
function CanvasElementBridge() {
  const { gl } = useThree();
  const setCanvasElement = useProjectStore((s) => s.setCanvasElement);

  useEffect(() => {
    setCanvasElement(gl.domElement);
    return () => setCanvasElement(null);
  }, [gl, setCanvasElement]);

  return null;
}

/** Runs inside the Canvas -- applies the horizontal clipping plane as a WebGLRenderer-global clipping plane (spec section 14: "horizontal clipping plane"), so every material is clipped consistently without touching each one individually. */
function HorizontalClipController({ renderOriginLocalZ }: { readonly renderOriginLocalZ: number }) {
  const { gl } = useThree();
  const horizontalClip = useProjectStore((s) => s.horizontalClip);

  useEffect(() => {
    if (!horizontalClip.enabled) {
      gl.clippingPlanes = [];
      return;
    }
    const elevationThreeY = horizontalClip.elevationLocalZ - renderOriginLocalZ;
    gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), elevationThreeY)];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, horizontalClip, renderOriginLocalZ]);

  return null;
}

export function Scene({ project }: SceneProps) {
  const setHover = useProjectStore((s) => s.setHover);
  const selectedInstanceId = useProjectStore((s) => s.selectedFoundationInstanceId);
  const pendingMeasurement = useProjectStore((s) => s.pendingMeasurement);
  const pickMeasurementPoint = useProjectStore((s) => s.pickMeasurementPoint);
  const terrainSurface = project.terrainSurface;

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

  function handleTerrainPick(localX: number, localY: number) {
    if (!pendingMeasurement || !project.terrainSurface) return;
    const query = queryElevation(project.terrainSurface, localX, localY);
    const localZ = query.elevation ?? 0;
    pickMeasurementPoint(localCoordinate(localX, localY, localZ));
  }

  return (
    <Canvas
      camera={{ position: [30, 25, 30], fov: 50 }}
      gl={{ localClippingEnabled: true, preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={0.8} />
      <gridHelper args={[100, 20]} />
      <axesHelper args={[5]} />

      <CameraRig />
      <CanvasElementBridge />
      <HorizontalClipController renderOriginLocalZ={project.renderOriginLocal.z} />

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
            onPickLocalXY={handleTerrainPick}
          />
          <GroundPointsCloud
            surface={project.terrainSurface}
            viewerFrame={viewerFrame}
            visible={project.layerStyles.terrain.showPoints}
            opacity={project.layerStyles.terrain.opacity}
          />
          <TerrainContours
            surface={project.terrainSurface}
            viewerFrame={viewerFrame}
            visible={project.layerStyles.terrain.showContours}
          />
        </>
      )}

      <PoleAnchors
        poleModel={project.poleModel}
        viewerFrame={viewerFrame}
        visible={project.layerStyles.pole.visible}
        opacity={project.layerStyles.pole.opacity}
      />

      <PoleMembersMesh
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
        selectedInstanceId={selectedInstanceId}
      />

      <GeotechLayers
        layers={project.geotechLayers}
        terrainSurface={project.terrainSurface}
        mastCentreProjectElevation={project.mastCentreProject.elevation}
        viewerFrame={viewerFrame}
      />

      <GroundwaterSurface
        groundwater={project.groundwater}
        terrainSurface={project.terrainSurface}
        mastCentreProjectElevation={project.mastCentreProject.elevation}
        viewerFrame={viewerFrame}
      />

      {terrainSurface &&
        project.excavationInstances.map((excavation) => {
          const foundation = project.foundationInstances.find(
            (f) => f.instanceId === excavation.foundationInstanceId
          );
          if (!foundation) return null;
          return (
            <ExcavationMesh
              key={excavation.id}
              excavation={excavation}
              foundation={foundation}
              terrainSurface={terrainSurface}
              viewerFrame={viewerFrame}
              selected={foundation.instanceId === selectedInstanceId}
            />
          );
        })}

      <MeasurementMarkers
        measurements={project.measurements}
        pendingPoints={pendingMeasurement?.points ?? []}
        viewerFrame={viewerFrame}
      />
    </Canvas>
  );
}
