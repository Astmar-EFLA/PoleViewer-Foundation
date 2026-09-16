/**
 * Apportions each excavation's own approximate volume
 * (geometry/excavationVolume.ts) across the project's geotech layer
 * categories, for the report's "material quantities" section. This is a
 * second-order approximation on top of an already-approximate volume
 * (spec sections 13/20: never a final construction quantity) -- it slices
 * the excavation's total bottom-to-terrain height by the geotech layer
 * boundary elevations at the excavation's own footprint centre only, not
 * resampled across the whole footprint, and allocates volume
 * proportionally to each band's share of that height. Depth not covered
 * by any geotech layer is reported honestly as its own "unclassified"
 * bucket rather than silently dropped or folded into a neighbouring
 * category.
 */

import type { Project } from "../domain/project";
import { boundaryLocalZ } from "../geometry/geotechBoundary";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { computeApproximateVolume } from "../geometry/excavationVolume";
import { queryElevation } from "../geometry/terrain";
import { hasBlockingExcavationGeometryError, validateExcavationInstance } from "../validation/excavationValidation";

export const UNCLASSIFIED_MATERIAL_CATEGORY = "unclassified";

export interface MaterialQuantityByCategory {
  readonly category: string;
  readonly volumeM3: number;
}

export type MaterialQuantitiesStatus = "calculated" | "no-terrain-surface" | "no-excavations";

export interface ExcavationMaterialQuantities {
  readonly status: MaterialQuantitiesStatus;
  /** Sum of every calculable excavation's own approximate volume -- "heildargröftur" (total excavation). Null when status != "calculated". */
  readonly totalVolumeM3: number | null;
  /** Sorted by descending volume. Empty when status != "calculated" or every excavation was blocked. */
  readonly byCategory: readonly MaterialQuantityByCategory[];
  readonly excavationsCalculated: number;
  readonly excavationsBlocked: number;
  readonly limitations: readonly string[];
}

const METHOD_LIMITATIONS: readonly string[] = [
  "Each excavation's own approximate volume is apportioned across geotech layer categories by depth fraction at the excavation's own footprint centre only -- a sloped or irregular layer boundary is only roughly represented, not resampled across the whole excavation.",
  "Geotech layers that overlap in depth (a data-entry inconsistency, not an expected case) will double-count that overlap across categories.",
];

const EMPTY_RESULT = (status: MaterialQuantitiesStatus): ExcavationMaterialQuantities => ({
  status,
  totalVolumeM3: null,
  byCategory: [],
  excavationsCalculated: 0,
  excavationsBlocked: 0,
  limitations: [],
});

export function computeExcavationMaterialQuantities(project: Project): ExcavationMaterialQuantities {
  const terrainSurface = project.terrainSurface;
  if (!terrainSurface) return EMPTY_RESULT("no-terrain-surface");
  if (project.excavationInstances.length === 0) return EMPTY_RESULT("no-excavations");

  const nowIso = project.modifiedAt;
  const categoryTotals = new Map<string, number>();
  let totalVolumeM3 = 0;
  let excavationsCalculated = 0;
  let excavationsBlocked = 0;

  const addToCategory = (category: string, volumeM3: number) => {
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + volumeM3);
  };

  for (const excavation of project.excavationInstances) {
    const foundation = project.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
    if (!foundation) {
      excavationsBlocked += 1;
      continue;
    }

    const geometry = generateExcavationGeometry(excavation, foundation, terrainSurface);
    const validationResults = validateExcavationInstance(excavation, foundation, geometry, nowIso);
    const geometryValid = !hasBlockingExcavationGeometryError(validationResults);
    const volume = computeApproximateVolume(excavation, geometry, terrainSurface, geometryValid);

    if (volume.status !== "calculated" || volume.approximateVolumeM3 === null) {
      excavationsBlocked += 1;
      continue;
    }
    excavationsCalculated += 1;
    totalVolumeM3 += volume.approximateVolumeM3;

    const centre = geometry.bottomFootprint.centre;
    const terrainZAtCentre = queryElevation(terrainSurface, centre.x, centre.y).elevation;
    const meanTopZ = geometry.topRing.reduce((sum, p) => sum + p.point.z, 0) / geometry.topRing.length;
    const bottomZ = excavation.bottomElevationM;
    const totalHeight = meanTopZ - bottomZ;

    if (terrainZAtCentre === null || !(totalHeight > 0)) {
      addToCategory(UNCLASSIFIED_MATERIAL_CATEGORY, volume.approximateVolumeM3);
      continue;
    }

    let classifiedHeight = 0;
    for (const layer of project.geotechLayers) {
      const layerZ1 = boundaryLocalZ(layer.topBoundary, terrainZAtCentre, project.mastCentreProject.elevation);
      const layerZ2 = boundaryLocalZ(layer.bottomBoundary, terrainZAtCentre, project.mastCentreProject.elevation);
      const bandTop = Math.min(Math.max(layerZ1, layerZ2), meanTopZ);
      const bandBottom = Math.max(Math.min(layerZ1, layerZ2), bottomZ);
      const overlap = bandTop - bandBottom;
      if (!(overlap > 0)) continue;

      classifiedHeight += overlap;
      addToCategory(layer.category, (overlap / totalHeight) * volume.approximateVolumeM3);
    }

    const unclassifiedHeight = totalHeight - classifiedHeight;
    if (unclassifiedHeight > 0) {
      addToCategory(UNCLASSIFIED_MATERIAL_CATEGORY, (unclassifiedHeight / totalHeight) * volume.approximateVolumeM3);
    }
  }

  const byCategory = Array.from(categoryTotals.entries())
    .map(([category, volumeM3]) => ({ category, volumeM3 }))
    .sort((a, b) => b.volumeM3 - a.volumeM3);

  return {
    status: "calculated",
    totalVolumeM3,
    byCategory,
    excavationsCalculated,
    excavationsBlocked,
    limitations: METHOD_LIMITATIONS,
  };
}
