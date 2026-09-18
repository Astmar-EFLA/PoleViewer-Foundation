import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { toThreeVector3 } from "./threeAdapters";
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
    useMemo(() => {
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(geometry.topCorners.length * 3);
      geometry.topCorners.forEach((c, i) => {
        const v3 = toThreeVector3(localToViewer(c, viewerFrame));
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;
      });
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setIndex([0, 1, 2, 0, 2, 3]);
      geom.computeVertexNormals();
      return geom;
    }, [geometry.topCorners, viewerFrame])
  );

  const skirtGeometry = useAutoDispose(
    useMemo(() => {
      const n = geometry.topRing.length;
      const positions = new Float32Array(n * 2 * 3);
      geometry.topRing.forEach((c, i) => {
        const v3 = toThreeVector3(localToViewer(c, viewerFrame));
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;
      });
      geometry.bottomRing.forEach((p, i) => {
        const v3 = toThreeVector3(localToViewer(p.point, viewerFrame));
        const idx = n + i;
        positions[idx * 3] = v3.x;
        positions[idx * 3 + 1] = v3.y;
        positions[idx * 3 + 2] = v3.z;
      });

      const indices: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const next = (i + 1) % n;
        const t0 = i;
        const t1 = next;
        const b0 = n + i;
        const b1 = n + next;
        indices.push(t0, t1, b1, t0, b1, b0);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return geom;
    }, [geometry.topRing, geometry.bottomRing, viewerFrame])
  );

  const intersectionLinePoints = useMemo(
    () =>
      [...geometry.bottomRing, geometry.bottomRing[0]!].map((p) => {
        const v3 = toThreeVector3(localToViewer(p.point, viewerFrame));
        return [v3.x, v3.y, v3.z] as [number, number, number];
      }),
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
