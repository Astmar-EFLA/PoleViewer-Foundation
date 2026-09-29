/**
 * An excavation's floor must always sit at the bottom of the gravel pad its
 * foundation rests on: floor = foundation base - pad thickness (0 when the
 * foundation has no pad). The foundation sits on the pad, the pad on the
 * excavation floor -- never independently above or below it. Editing any of
 * the three (foundation base, pad thickness, excavation floor) pulls the
 * others to match; these helpers are called from both directions in
 * projectStore.ts.
 */

import type { ExcavationInstance } from "../domain/excavation";
import type { FillInstance } from "../domain/fill";
import { gravelPadThicknessFor } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";

/** Thickness of the gravel pad under a foundation (0 when it has none) -- the excavation floor sits this far below the foundation base. */
function gravelPadThicknessUnder(foundationInstanceId: string, gravelPads: readonly FillInstance[]): number {
  return gravelPadThicknessFor(foundationInstanceId, gravelPads) ?? 0;
}

/** Called after a foundation's baseElevation or its gravel pad's thickness changes (type/parameter edit, copy-to-similar, pad edit) -- pulls every linked excavation's floor to the bottom of the pad. */
export function syncExcavationBottomsToFoundations(
  excavationInstances: readonly ExcavationInstance[],
  foundationInstances: readonly FoundationInstance[],
  gravelPads: readonly FillInstance[]
): ExcavationInstance[] {
  return excavationInstances.map((excavation) => {
    const foundation = foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
    if (!foundation) return excavation;
    const floor = foundation.baseElevation - gravelPadThicknessUnder(foundation.instanceId, gravelPads);
    return floor === excavation.bottomElevationM ? excavation : { ...excavation, bottomElevationM: floor };
  });
}

/** Called after an excavation's bottomElevationM is directly edited -- pulls its own foundation's base to the top of the gravel pad on that floor, overriding the anchor-connection solve (the user has explicitly chosen a dig depth; validateFoundationInstance's connection-mismatch rule is what then flags whether the foundation, as configured, still reaches its anchor). */
export function syncFoundationBaseToExcavation(
  foundationInstances: readonly FoundationInstance[],
  excavation: ExcavationInstance,
  gravelPads: readonly FillInstance[]
): FoundationInstance[] {
  return foundationInstances.map((f) => {
    if (f.instanceId !== excavation.foundationInstanceId) return f;
    const base = excavation.bottomElevationM + gravelPadThicknessUnder(f.instanceId, gravelPads);
    return f.baseElevation === base ? f : { ...f, baseElevation: base };
  });
}
