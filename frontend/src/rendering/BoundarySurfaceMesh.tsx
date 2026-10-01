import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { BoundarySurface } from "../geometry/geotechBoundary";
import { buildTriangulatedSurface } from "./meshGeometry";
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
    useMemo(() => buildTriangulatedSurface(surface.points, surface.triangles, viewerFrame), [surface, viewerFrame])
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
