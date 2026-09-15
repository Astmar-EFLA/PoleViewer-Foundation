import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { GeotechLayer } from "../domain/geotech";
import type { TerrainSurface } from "../domain/terrain";
import { generateBoundarySurface } from "../geometry/geotechBoundary";
import { BoundarySurfaceMesh } from "./BoundarySurfaceMesh";

interface GeotechLayersProps {
  readonly layers: readonly GeotechLayer[];
  readonly terrainSurface: TerrainSurface | null;
  readonly mastCentreProjectElevation: number;
  readonly viewerFrame: ViewerFrameDefinition;
}

/**
 * Renders each geotechnical layer's top and bottom boundary as two
 * independent surfaces (never a filled solid -- see BoundarySurfaceMesh's
 * doc comment). Requires a terrain surface: boundary geometry is derived
 * from the terrain TIN's own points/topology, so there is nothing to
 * render before terrain exists.
 */
export function GeotechLayers({
  layers,
  terrainSurface,
  mastCentreProjectElevation,
  viewerFrame,
}: GeotechLayersProps) {
  if (!terrainSurface) return null;

  return (
    <group>
      {layers.map((layer) => {
        if (!layer.visible) return null;
        const topSurface = generateBoundarySurface(layer.topBoundary, terrainSurface, mastCentreProjectElevation);
        const bottomSurface = generateBoundarySurface(
          layer.bottomBoundary,
          terrainSurface,
          mastCentreProjectElevation
        );

        return (
          <group key={layer.id}>
            <BoundarySurfaceMesh
              surface={topSurface}
              viewerFrame={viewerFrame}
              visible
              opacity={layer.opacity}
              wireframe={layer.wireframe}
              color={layer.colour}
            />
            <BoundarySurfaceMesh
              surface={bottomSurface}
              viewerFrame={viewerFrame}
              visible
              opacity={layer.opacity}
              wireframe={layer.wireframe}
              color={layer.colour}
            />
          </group>
        );
      })}
    </group>
  );
}
