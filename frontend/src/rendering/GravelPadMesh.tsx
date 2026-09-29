import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateGravelPadBox } from "../geometry/gravelPadGeometry";
import { domainZRotationToThreeYRotation, toThreeArrayXYZ } from "./threeAdapters";

interface GravelPadMeshProps {
  readonly pad: FillInstance;
  readonly foundation: FoundationInstance;
  readonly excavation: ExcavationInstance | undefined;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly selected?: boolean;
}

/**
 * The gravel pad under a foundation (geometry/gravelPadGeometry.ts): a flat
 * box filling the excavation floor, placed the same way FoundationMeshes
 * places a box part. Needs no terrain.
 */
export function GravelPadMesh({ pad, foundation, excavation, viewerFrame, selected = false }: GravelPadMeshProps) {
  if (!pad.visible) return null;
  const box = generateGravelPadBox(pad, foundation, excavation);
  return (
    <mesh
      position={toThreeArrayXYZ(localToViewer(box.centre, viewerFrame))}
      rotation={[0, domainZRotationToThreeYRotation(box.orientationRadians), 0]}
    >
      <boxGeometry args={[box.halfExtents.x * 2, box.halfExtents.z * 2, box.halfExtents.y * 2]} />
      <meshStandardMaterial
        color={selected ? "#e0a030" : pad.colour}
        transparent
        opacity={pad.opacity}
        wireframe={pad.wireframe}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
