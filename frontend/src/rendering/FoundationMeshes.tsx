import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateRectangularPadPedestalGeometry } from "../geometry/foundationGeometry";
import { domainZRotationToThreeYRotation, toThreeArrayXYZ } from "./threeAdapters";

interface FoundationMeshesProps {
  readonly instances: readonly FoundationInstance[];
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
}

/**
 * Renders each foundation instance's pad and pedestal as independent boxes,
 * one group per instance (never a shared/merged mesh) -- a parameter change
 * on one instance regenerates only that instance's geometry (ADR-006).
 */
export function FoundationMeshes({
  instances,
  viewerFrame,
  visible,
  opacity,
}: FoundationMeshesProps) {
  if (!visible) return null;

  return (
    <group>
      {instances.map((instance) => {
        if (!instance.visible) return null;

        const geometry = generateRectangularPadPedestalGeometry(instance);
        const padViewer = localToViewer(geometry.pad.centre, viewerFrame);
        const pedestalViewer = localToViewer(geometry.pedestal.centre, viewerFrame);
        const rotationY = domainZRotationToThreeYRotation(instance.orientationRadians);
        const instanceOpacity = opacity * instance.opacity;

        return (
          <group key={instance.instanceId}>
            <mesh position={toThreeArrayXYZ(padViewer)} rotation={[0, rotationY, 0]}>
              <boxGeometry
                args={[
                  geometry.pad.halfExtents.x * 2,
                  geometry.pad.halfExtents.z * 2,
                  geometry.pad.halfExtents.y * 2,
                ]}
              />
              <meshStandardMaterial color={instance.colour} transparent opacity={instanceOpacity} />
            </mesh>
            <mesh position={toThreeArrayXYZ(pedestalViewer)} rotation={[0, rotationY, 0]}>
              <boxGeometry
                args={[
                  geometry.pedestal.halfExtents.x * 2,
                  geometry.pedestal.halfExtents.z * 2,
                  geometry.pedestal.halfExtents.y * 2,
                ]}
              />
              <meshStandardMaterial color={instance.colour} transparent opacity={instanceOpacity} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
