/**
 * An excavation's floor and its own foundation's base face must always be
 * the same elevation -- a foundation is built to rest exactly on the
 * bottom of its own excavation, never independently above or below it
 * (validateExcavationInstance's own "excavation.bottom-above-foundation-
 * base" rule already treats a mismatch as a blocking error). Before this,
 * the two values were only ever set equal once, at excavation creation
 * (see projectDefaults.ts's buildDefaultExcavationInstances) -- editing
 * either one afterward silently let them drift apart. These two helpers
 * are called from both directions in projectStore.ts so editing either
 * value always pulls the other one to match.
 */

import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";

/** Called after a foundation's baseElevation changes (type/parameter edit, copy-to-similar) -- pulls every linked excavation's bottom to match. */
export function syncExcavationBottomsToFoundations(
  excavationInstances: readonly ExcavationInstance[],
  foundationInstances: readonly FoundationInstance[]
): ExcavationInstance[] {
  return excavationInstances.map((excavation) => {
    const foundation = foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
    if (!foundation || foundation.baseElevation === excavation.bottomElevationM) return excavation;
    return { ...excavation, bottomElevationM: foundation.baseElevation };
  });
}

/** Called after an excavation's bottomElevationM is directly edited -- pulls its own foundation's base to match, overriding the anchor-connection solve (the user has explicitly chosen a dig depth; validateFoundationInstance's connection-mismatch rule is what then flags whether the foundation, as configured, still reaches its anchor). */
export function syncFoundationBaseToExcavation(
  foundationInstances: readonly FoundationInstance[],
  excavation: ExcavationInstance
): FoundationInstance[] {
  return foundationInstances.map((f) =>
    f.instanceId === excavation.foundationInstanceId && f.baseElevation !== excavation.bottomElevationM
      ? { ...f, baseElevation: excavation.bottomElevationM }
      : f
  );
}
