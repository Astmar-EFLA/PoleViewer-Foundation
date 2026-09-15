import { useMemo } from "react";
import * as THREE from "three";
import { localCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { BoundarySurface } from "../geometry/geotechBoundary";
import { localToViewer } from "../geometry/coordinateTransform";
import { toThreeVector3 } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface BoundarySurfaceMeshProps {
  readonly surface: BoundarySurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly wireframe?: boolean;
  readonly color: string;
}

/**
 * Generic renderer for any {points, triangles} boundary surface -- used for
 * a geotechnical layer's top/bottom boundaries and for groundwater. Two
 * such surfaces rendered side by side (a layer's top and bottom) show the
 * boundaries that were actually defined, without asserting that the volume
 * between them is a known, watertight geological solid (spec section 12) --
 * that distinction is a documentation/product-framing one, not something
 * this component itself can enforce, so it's called out here explicitly.
 */
export function BoundarySurfaceMesh({
  surface,
  viewerFrame,
  visible,
  opacity,
  wireframe = false,
  color,
}: BoundarySurfaceMeshProps) {
  const geometry = useAutoDispose(
    useMemo(() => {
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
    }, [surface, viewerFrame])
  );

  if (!visible) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={opacity >= 0.999}
        wireframe={wireframe}
      />
    </mesh>
  );
}
