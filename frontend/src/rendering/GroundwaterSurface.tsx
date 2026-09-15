import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { Groundwater } from "../domain/geotech";
import type { TerrainSurface } from "../domain/terrain";
import { generateBoundarySurface } from "../geometry/geotechBoundary";
import { BoundarySurfaceMesh } from "./BoundarySurfaceMesh";

interface GroundwaterSurfaceProps {
  readonly groundwater: Groundwater | null;
  readonly terrainSurface: TerrainSurface | null;
  readonly mastCentreProjectElevation: number;
  readonly viewerFrame: ViewerFrameDefinition;
}

export function GroundwaterSurface({
  groundwater,
  terrainSurface,
  mastCentreProjectElevation,
  viewerFrame,
}: GroundwaterSurfaceProps) {
  if (!groundwater || !terrainSurface || !groundwater.visible) return null;

  const surface = generateBoundarySurface(groundwater.boundary, terrainSurface, mastCentreProjectElevation);

  return (
    <BoundarySurfaceMesh
      surface={surface}
      viewerFrame={viewerFrame}
      visible
      opacity={groundwater.opacity}
      wireframe={groundwater.wireframe}
      color={groundwater.colour}
    />
  );
}
