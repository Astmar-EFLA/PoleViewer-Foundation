import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { buildQuad, buildRingSkirt, closedRingThreePoints } from "./meshGeometry";
import { useAutoDispose } from "./useAutoDispose";

interface FillMeshProps {
  readonly fill: FillInstance;
  readonly foundation: FoundationInstance;
  readonly terrainSurface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly selected?: boolean;
}

/**
 * Renders a fill as three parts, all derived from the same
 * geometry/fillGeometry.ts output (ADR-006 -- nothing here computes fill
 * shape itself, only projects it to Three.js objects). The vertical mirror
 * of ExcavationMesh.tsx:
 *  - a flat top-plate quad (mirrors excavation's flat bottom quad)
 *  - a ring of "skirt" quads (top plate perimeter -> terrain-intersection
 *    ring) approximating the sloped sides, running downward instead of up
 *  - a highlighted polyline tracing the terrain-intersection ring itself
 *    (here at the bottom, where the fill meets natural grade)
 */
export function FillMesh({ fill, foundation, terrainSurface, viewerFrame, selected = false }: FillMeshProps) {
  const geometry = useMemo(
    () => generateFillGeometry(fill, foundation, terrainSurface),
    [fill, foundation, terrainSurface]
  );

  const topGeometry = useAutoDispose(
    useMemo(() => buildQuad(geometry.topCorners, viewerFrame), [geometry.topCorners, viewerFrame])
  );

  const skirtGeometry = useAutoDispose(
    useMemo(
      () => buildRingSkirt(geometry.topRing, geometry.bottomRing.map((p) => p.point), viewerFrame),
      [geometry.bottomRing, geometry.topRing, viewerFrame]
    )
  );

  const intersectionLinePoints = useMemo(
    () => closedRingThreePoints(geometry.bottomRing.map((p) => p.point), viewerFrame),
    [geometry.bottomRing, viewerFrame]
  );

  if (!fill.visible) return null;

  const color = selected ? "#e0a030" : fill.colour;

  return (
    <group>
      <mesh geometry={topGeometry}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={fill.opacity}
          side={THREE.DoubleSide}
          wireframe={fill.wireframe}
        />
      </mesh>
      <mesh geometry={skirtGeometry}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={fill.opacity * 0.8}
          side={THREE.DoubleSide}
          wireframe={fill.wireframe}
        />
      </mesh>
      <Line points={intersectionLinePoints} color={geometry.truncated ? "#c02020" : "#e0a030"} lineWidth={2} />
    </group>
  );
}
