import type { Project } from "../domain/project";
import type { ValidationResult } from "../domain/validation";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { placedAnchorPosition } from "../geometry/polePlacement";
import { validateExcavationInstance } from "./excavationValidation";
import { validateFoundationInstance } from "./foundationValidation";
import { validateGeotechLayer, validateGroundwaterFoundationIntersection } from "./geotechValidation";
import { validatePoleModelReferences } from "./poleModelValidation";

/**
 * Aggregates every validator already run individually by the per-domain
 * panels (foundation, excavation, geotech, pole) into one list, for the
 * project-wide "validation summary" export (spec section 20). This calls
 * the exact same validation functions those panels use -- it is not a
 * second, independent set of checks, so the summary can never disagree
 * with what a panel is showing for the same object.
 */
export function buildProjectValidationSummary(project: Project, nowIso: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  results.push(...validatePoleModelReferences(project.poleModel, nowIso));

  for (const foundation of project.foundationInstances) {
    const anchorPosition = placedAnchorPosition(foundation.anchorId, project.poleModel);
    results.push(...validateFoundationInstance(foundation, anchorPosition, nowIso));
  }

  if (project.terrainSurface) {
    const terrainSurface = project.terrainSurface;

    for (const layer of project.geotechLayers) {
      results.push(...validateGeotechLayer(layer, terrainSurface, project.mastCentreProject.elevation, nowIso));
    }

    if (project.groundwater) {
      const groundwater = project.groundwater;
      for (const foundation of project.foundationInstances) {
        results.push(
          ...validateGroundwaterFoundationIntersection(
            groundwater,
            foundation,
            terrainSurface,
            project.mastCentreProject.elevation,
            nowIso
          )
        );
      }
    }

    for (const excavation of project.excavationInstances) {
      const foundation = project.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
      if (!foundation) continue;
      const geometry = generateExcavationGeometry(excavation, foundation, terrainSurface);
      results.push(...validateExcavationInstance(excavation, foundation, geometry, nowIso));
    }
  }

  return results;
}
