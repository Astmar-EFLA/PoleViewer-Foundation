import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { buildQuad, buildRingSkirt, closedRingThreePoints } from "./meshGeometry";
import { useAutoDispose } from "./useAutoDispose";

interface ExcavationMeshProps {
  readonly excavation: ExcavationInstance;
  readonly foundation: FoundationInstance;
  readonly terrainSurface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly selected?: boolean;
}

/**
 * Renders an excavation as three parts, all derived from the same
 * geometry/excavationGeometry.ts output (ADR-006 -- nothing here computes
 * excavation shape itself, only projects it to Three.js objects):
 *  - a flat bottom quad
 *  - a ring of "skirt" quads (bottom perimeter -> terrain-intersection ring)
 *    approximating the sloped sides
 *  - a highlighted polyline tracing the terrain-intersection ring itself
 *    (spec: "terrain-intersection line" is one of the required outputs)
 */
export function ExcavationMesh({
  excavation,
  foundation,
  terrainSurface,
  viewerFrame,
  selected = false,
}: ExcavationMeshProps) {
  const geometry = useMemo(
    () => generateExcavationGeometry(excavation, foundation, terrainSurface),
    [excavation, foundation, terrainSurface]
  );

  const bottomGeometry = useAutoDispose(
    useMemo(() => buildQuad(geometry.bottomCorners, viewerFrame), [geometry.bottomCorners, viewerFrame])
  );

  const skirtGeometry = useAutoDispose(
    useMemo(
      () => buildRingSkirt(geometry.bottomRing, geometry.topRing.map((p) => p.point), viewerFrame),
      [geometry.bottomRing, geometry.topRing, viewerFrame]
    )
  );

  const intersectionLinePoints = useMemo(
    () => closedRingThreePoints(geometry.topRing.map((p) => p.point), viewerFrame),
    [geometry.topRing, viewerFrame]
  );

  if (!excavation.visible) return null;

  const color = selected ? "#e0a030" : excavation.colour;

  return (
    <group>
      <mesh geometry={bottomGeometry}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={excavation.opacity}
          side={THREE.DoubleSide}
          wireframe={excavation.wireframe}
        />
      </mesh>
      <mesh geometry={skirtGeometry}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={excavation.opacity * 0.8}
          side={THREE.DoubleSide}
          wireframe={excavation.wireframe}
        />
      </mesh>
      <Line points={intersectionLinePoints} color={geometry.truncated ? "#c02020" : "#e0a030"} lineWidth={2} />
    </group>
  );
}
