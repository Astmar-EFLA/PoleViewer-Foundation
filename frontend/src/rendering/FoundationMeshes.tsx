import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateFoundationGeometry, type OrientedFrustum } from "../geometry/foundationGeometry";
import { domainZRotationToThreeYRotation, toThreeArrayXYZ } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface FoundationMeshesProps {
  readonly instances: readonly FoundationInstance[];
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly selectedInstanceId?: string | null;
}

interface FrustumPartProps {
  readonly frustum: OrientedFrustum;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly colour: string;
  readonly opacity: number;
}

/**
 * A frustum part (the tapered pad-to-pedestal transition -- see
 * domain/foundation.ts's rectangular-pad-tapered-pedestal) needs a custom
 * BufferGeometry, unlike a box part's declarative <boxGeometry>, since its
 * top and bottom faces are different sizes. Built in local, unrotated,
 * origin-centred space (bottom face at -halfHeight using bottomHalfExtents,
 * top face at +halfHeight using topHalfExtents) exactly like <boxGeometry>
 * itself is, so the same position/rotation props that place a box part
 * place this identically -- a separate component only because building the
 * geometry needs its own useMemo/useAutoDispose, which a .map() callback
 * can't call conditionally.
 */
function FrustumPart({ frustum, position, rotationY, colour, opacity }: FrustumPartProps) {
  const geometry = useAutoDispose(
    useMemo(() => {
      const { bottomHalfExtents, topHalfExtents, halfHeight } = frustum;
      const positions = new Float32Array(
        [
          [-bottomHalfExtents.x, -halfHeight, -bottomHalfExtents.y],
          [bottomHalfExtents.x, -halfHeight, -bottomHalfExtents.y],
          [bottomHalfExtents.x, -halfHeight, bottomHalfExtents.y],
          [-bottomHalfExtents.x, -halfHeight, bottomHalfExtents.y],
          [-topHalfExtents.x, halfHeight, -topHalfExtents.y],
          [topHalfExtents.x, halfHeight, -topHalfExtents.y],
          [topHalfExtents.x, halfHeight, topHalfExtents.y],
          [-topHalfExtents.x, halfHeight, topHalfExtents.y],
        ].flat()
      );
      // Bottom quad, top quad, then 4 side quads connecting corner i to i+1
      // at both levels -- the same "ring of bottom corners to ring of top
      // corners" pattern ExcavationMesh.tsx/FillMesh.tsx use for their
      // skirts, just with a fixed 4-corner rectangle instead of a sampled
      // terrain-following ring.
      const indices: number[] = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
      for (let i = 0; i < 4; i += 1) {
        const next = (i + 1) % 4;
        indices.push(i, next, 4 + next, i, 4 + next, 4 + i);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return geom;
    }, [
      frustum.bottomHalfExtents.x,
      frustum.bottomHalfExtents.y,
      frustum.topHalfExtents.x,
      frustum.topHalfExtents.y,
      frustum.halfHeight,
    ])
  );

  return (
    <mesh position={position} rotation={[0, rotationY, 0]} geometry={geometry}>
      <meshStandardMaterial color={colour} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Renders each foundation instance's geometry `parts` (pad+pedestal, one box
 * per step, or pad+frustum+pedestal -- see geometry/foundationGeometry.ts)
 * as independent solids, one group per instance (never a shared/merged mesh)
 * -- a parameter change on one instance regenerates only that instance's
 * geometry (ADR-006). Part count and shape are generic here; this component
 * does not know or care which foundation type produced them, beyond
 * dispatching a "box" part to a declarative <boxGeometry> and a "frustum"
 * part to FrustumPart above.
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
        const colour = isSelected ? "#e0a030" : instance.colour;

        return (
          <group key={instance.instanceId}>
            {geometry.parts.map((part, index) => {
              const partPosition = toThreeArrayXYZ(localToViewer(part.centre, viewerFrame));
              if (part.kind === "box") {
                return (
                  <mesh key={index} position={partPosition} rotation={[0, rotationY, 0]}>
                    <boxGeometry
                      args={[part.halfExtents.x * 2, part.halfExtents.z * 2, part.halfExtents.y * 2]}
                    />
                    <meshStandardMaterial color={colour} transparent opacity={instanceOpacity} />
                  </mesh>
                );
              }
              return (
                <FrustumPart
                  key={index}
                  frustum={part}
                  position={partPosition}
                  rotationY={rotationY}
                  colour={colour}
                  opacity={instanceOpacity}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
