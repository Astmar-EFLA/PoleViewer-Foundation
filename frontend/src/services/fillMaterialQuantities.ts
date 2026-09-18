/**
 * Aggregates every fill instance's own approximate volume
 * (geometry/fillVolume.ts) into a project-wide total, for the report's
 * "material quantities" section. Unlike excavationMaterialQuantities.ts,
 * this does not apportion volume across project.geotechLayers categories --
 * those describe *existing* ground strata, and fill material is imported/
 * placed, not excavated from them, so a geotech-category breakdown would
 * misrepresent what the fill volume actually is. Just a total plus
 * calculated/blocked counts, same never-a-final-quantity caveat as
 * excavation's own (spec sections 13/20).
 */

import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { Project } from "../domain/project";
import type { FillGeometry } from "../geometry/fillGeometry";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { computeApproximateFillVolume } from "../geometry/fillVolume";
import type { ValidationResult } from "../domain/validation";
import { hasBlockingFillGeometryError, validateFillInstance } from "../validation/fillValidation";

export type FillMaterialQuantitiesStatus = "calculated" | "no-terrain-surface" | "no-fills";

export interface FillMaterialQuantities {
  readonly status: FillMaterialQuantitiesStatus;
  /** Sum of every calculable fill's own approximate volume. Null when status != "calculated". */
  readonly totalVolumeM3: number | null;
  readonly fillsCalculated: number;
  readonly fillsBlocked: number;
  readonly limitations: readonly string[];
}

const METHOD_LIMITATIONS: readonly string[] = [
  "Each fill's own approximate volume uses the same mean-height rectangular frustum approximation as excavation volumes -- the true terrain intersection is irregular and only approximated.",
  "No breakdown by fill material type or compaction class is attempted -- this is a total placed-fill volume only.",
];

const EMPTY_RESULT = (status: FillMaterialQuantitiesStatus): FillMaterialQuantities => ({
  status,
  totalVolumeM3: null,
  fillsCalculated: 0,
  fillsBlocked: 0,
  limitations: [],
});

/**
 * Takes the fill instance list explicitly (rather than reading
 * `project.fillInstances` internally) so it can be reused for any fill
 * layer -- the base fill (`project.fillInstances`, the default) and the
 * uplift-fill layer (`project.upliftFillInstances`, passing
 * `validateUpliftFillInstance`) both call this the same way.
 */
export function computeFillMaterialQuantities(
  project: Project,
  fillInstances: readonly FillInstance[] = project.fillInstances,
  validate: (
    fill: FillInstance,
    foundation: FoundationInstance,
    geometry: FillGeometry | null,
    nowIso: string
  ) => ValidationResult[] = validateFillInstance
): FillMaterialQuantities {
  const terrainSurface = project.terrainSurface;
  if (!terrainSurface) return EMPTY_RESULT("no-terrain-surface");
  if (fillInstances.length === 0) return EMPTY_RESULT("no-fills");

  const nowIso = project.modifiedAt;
  let totalVolumeM3 = 0;
  let fillsCalculated = 0;
  let fillsBlocked = 0;

  for (const fill of fillInstances) {
    const foundation = project.foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId);
    if (!foundation) {
      fillsBlocked += 1;
      continue;
    }

    const geometry = generateFillGeometry(fill, foundation, terrainSurface);
    const validationResults = validate(fill, foundation, geometry, nowIso);
    const geometryValid = !hasBlockingFillGeometryError(validationResults);
    const volume = computeApproximateFillVolume(fill, geometry, terrainSurface, geometryValid);

    if (volume.status !== "calculated" || volume.approximateVolumeM3 === null) {
      fillsBlocked += 1;
      continue;
    }
    fillsCalculated += 1;
    totalVolumeM3 += volume.approximateVolumeM3;
  }

  return {
    status: "calculated",
    totalVolumeM3,
    fillsCalculated,
    fillsBlocked,
    limitations: METHOD_LIMITATIONS,
  };
}
