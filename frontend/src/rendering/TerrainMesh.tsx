import { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { localCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { TerrainSurface } from "../domain/terrain";
import { localToViewer, viewerToLocal } from "../geometry/coordinateTransform";
import { fromThreeVector3, toThreeVector3 } from "./threeAdapters";

interface TerrainMeshProps {
  readonly surface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly wireframe?: boolean;
  readonly onHoverLocalXY?: (localX: number, localY: number) => void;
  readonly onHoverEnd?: () => void;
}

/**
 * Renders the terrain TIN. Vertex positions are derived from the domain
 * surface's local-space points at render time (the only float32 boundary,
 * per ADR-004) -- the geometry is rebuilt only when `surface` or
 * `viewerFrame` change, never mutated in place, so this stays a pure
 * projection of domain state (ADR-006), not a second source of truth.
 */
export function TerrainMesh({
  surface,
  viewerFrame,
  visible,
  opacity,
  wireframe = false,
  onHoverLocalXY,
  onHoverEnd,
}: TerrainMeshProps) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(surface.points.length * 3);

    for (let i = 0; i < surface.points.length; i += 1) {
      const p = surface.points[i]!;
      const viewer = localToViewer(localCoordinate(p.x, p.y, p.z), viewerFrame);
      const v3 = toThreeVector3(viewer);
      positions[i * 3] = v3.x;
      positions[i * 3 + 1] = v3.y;
      positions[i * 3 + 2] = v3.z;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const indices: number[] = [];
    for (const triangle of surface.triangles) {
      indices.push(triangle.indices[0], triangle.indices[1], triangle.indices[2]);
    }
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [surface, viewerFrame]);

  if (!visible) return null;

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (!onHoverLocalXY) return;
    const viewerPoint = fromThreeVector3(event.point);
    const local = viewerToLocal(viewerPoint, viewerFrame);
    onHoverLocalXY(local.x, local.y);
  }

  return (
    <mesh
      geometry={geometry}
      onPointerMove={handlePointerMove}
      onPointerOut={() => onHoverEnd?.()}
    >
      <meshStandardMaterial
        color="#8a9a7b"
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={opacity >= 0.999}
        wireframe={wireframe}
      />
    </mesh>
  );
}
