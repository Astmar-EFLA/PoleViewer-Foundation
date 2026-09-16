import { useMemo } from "react";
import * as THREE from "three";
import { localCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { TerrainPoint, TerrainSurface } from "../domain/terrain";
import type { ContourSegment } from "../geometry/contours";
import { generateContours } from "../geometry/contours";
import { localToViewer } from "../geometry/coordinateTransform";
import { toThreeVector3 } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface TerrainContoursProps {
  readonly surface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly color?: string;
  readonly indexColor?: string;
}

function toThreePosition(point: TerrainPoint, viewerFrame: ViewerFrameDefinition): THREE.Vector3 {
  return toThreeVector3(localToViewer(localCoordinate(point.x, point.y, point.z), viewerFrame));
}

function buildLineSegmentsGeometry(
  segments: readonly ContourSegment[],
  viewerFrame: ViewerFrameDefinition
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(segments.length * 6);
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const a = toThreePosition(segment.a, viewerFrame);
    const b = toThreePosition(segment.b, viewerFrame);
    positions[i * 6] = a.x;
    positions[i * 6 + 1] = a.y;
    positions[i * 6 + 2] = a.z;
    positions[i * 6 + 3] = b.x;
    positions[i * 6 + 4] = b.y;
    positions[i * 6 + 5] = b.z;
  }
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
}

/**
 * Renders elevation contour lines traced across the terrain TIN, as an
 * overlay independent of the filled surface / wireframe / points toggles
 * (spec section 9's terrain display modes -- this is a fourth, orthogonal
 * one). Every 5th line is an "index contour" drawn bolder and darker, the
 * standard topographic-map convention, so the drawing reads at a glance
 * without needing per-line elevation labels.
 */
export function TerrainContours({
  surface,
  viewerFrame,
  visible,
  color = "#4a3b1f",
  indexColor = "#2a2210",
}: TerrainContoursProps) {
  const contours = useMemo(() => generateContours(surface), [surface]);
  const minorSegments = useMemo(() => contours.segments.filter((s) => !s.isIndex), [contours]);
  const indexSegments = useMemo(() => contours.segments.filter((s) => s.isIndex), [contours]);

  const minorGeometry = useAutoDispose(
    useMemo(() => buildLineSegmentsGeometry(minorSegments, viewerFrame), [minorSegments, viewerFrame])
  );
  const indexGeometry = useAutoDispose(
    useMemo(() => buildLineSegmentsGeometry(indexSegments, viewerFrame), [indexSegments, viewerFrame])
  );

  if (!visible) return null;

  return (
    <>
      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <lineSegments geometry={indexGeometry}>
        <lineBasicMaterial color={indexColor} linewidth={2} />
      </lineSegments>
    </>
  );
}
