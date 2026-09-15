import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { toThreeVector3 } from "./threeAdapters";
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
    useMemo(() => {
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(geometry.bottomCorners.length * 3);
      geometry.bottomCorners.forEach((c, i) => {
        const v3 = toThreeVector3(localToViewer(c, viewerFrame));
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;
      });
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setIndex([0, 1, 2, 0, 2, 3]);
      geom.computeVertexNormals();
      return geom;
    }, [geometry.bottomCorners, viewerFrame])
  );

  const skirtGeometry = useAutoDispose(
    useMemo(() => {
      const n = geometry.bottomRing.length;
      const positions = new Float32Array(n * 2 * 3);
      geometry.bottomRing.forEach((c, i) => {
        const v3 = toThreeVector3(localToViewer(c, viewerFrame));
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;
      });
      geometry.topRing.forEach((p, i) => {
        const v3 = toThreeVector3(localToViewer(p.point, viewerFrame));
        const idx = n + i;
        positions[idx * 3] = v3.x;
        positions[idx * 3 + 1] = v3.y;
        positions[idx * 3 + 2] = v3.z;
      });

      const indices: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const next = (i + 1) % n;
        const b0 = i;
        const b1 = next;
        const t0 = n + i;
        const t1 = n + next;
        indices.push(b0, b1, t1, b0, t1, t0);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return geom;
    }, [geometry.bottomRing, geometry.topRing, viewerFrame])
  );

  const intersectionLinePoints = useMemo(
    () =>
      [...geometry.topRing, geometry.topRing[0]!].map((p) => {
        const v3 = toThreeVector3(localToViewer(p.point, viewerFrame));
        return [v3.x, v3.y, v3.z] as [number, number, number];
      }),
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
