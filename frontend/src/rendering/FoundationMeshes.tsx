import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { domainZRotationToThreeYRotation, toThreeArrayXYZ } from "./threeAdapters";

interface FoundationMeshesProps {
  readonly instances: readonly FoundationInstance[];
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly selectedInstanceId?: string | null;
}

/**
 * Renders each foundation instance's geometry `parts` (pad+pedestal, or one
 * box per step -- see geometry/foundationGeometry.ts) as independent boxes,
 * one group per instance (never a shared/merged mesh) -- a parameter change
 * on one instance regenerates only that instance's geometry (ADR-006). Part
 * count and shape are generic here; this component does not know or care
 * which foundation type produced them.
 */
export function FoundationMeshes({
  instances,
  viewerFrame,
  visible,
  opacity,
  selectedInstanceId = null,
}: FoundationMeshesProps) {
  if (!visible) return null;

  return (
    <group>
      {instances.map((instance) => {
        if (!instance.visible) return null;

        const geometry = generateFoundationGeometry(instance);
        const rotationY = domainZRotationToThreeYRotation(instance.orientationRadians);
        const instanceOpacity = opacity * instance.opacity;
        const isSelected = instance.instanceId === selectedInstanceId;

        return (
          <group key={instance.instanceId}>
            {geometry.parts.map((part, index) => {
              const partViewer = localToViewer(part.centre, viewerFrame);
              return (
                <mesh key={index} position={toThreeArrayXYZ(partViewer)} rotation={[0, rotationY, 0]}>
                  <boxGeometry
                    args={[part.halfExtents.x * 2, part.halfExtents.z * 2, part.halfExtents.y * 2]}
                  />
                  <meshStandardMaterial
                    color={isSelected ? "#e0a030" : instance.colour}
                    transparent
                    opacity={instanceOpacity}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
