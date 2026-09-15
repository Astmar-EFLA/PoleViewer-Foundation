import { useMemo } from "react";
import * as THREE from "three";
import { localCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { TerrainSurface } from "../domain/terrain";
import { localToViewer } from "../geometry/coordinateTransform";
import { toThreeVector3 } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface GroundPointsCloudProps {
  readonly surface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly pointSize?: number;
  readonly color?: string;
}

/**
 * Renders the terrain surface's own source points (never a resampled/
 * averaged value -- these are the exact measured vertices the TIN was
 * built from) as a separate, independently-toggleable layer from the
 * triangulated surface, so "points only" / "surface only" / "both" are all
 * available (spec section 9's required terrain display modes).
 */
export function GroundPointsCloud({
  surface,
  viewerFrame,
  visible,
  opacity,
  pointSize = 0.3,
  color = "#3a6b35",
}: GroundPointsCloudProps) {
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
      return geom;
    }, [surface, viewerFrame])
  );

  if (!visible) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial color={color} size={pointSize} sizeAttenuation transparent opacity={opacity} />
    </points>
  );
}
