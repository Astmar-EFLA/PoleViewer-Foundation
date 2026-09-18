/**
 * A fill's top plate and its own foundation's base face must always be the
 * same elevation -- a foundation is built to rest exactly on top of its own
 * fill, never independently above or below it (mirrors
 * excavationFoundationSync.ts's rationale; see
 * validateFillInstance's "fill.top-below-foundation-base" rule). These two
 * helpers are called from both directions in projectStore.ts so editing
 * either value always pulls the other one to match.
 */

import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";

/** Called after a foundation's baseElevation changes (type/parameter edit, copy-to-similar) -- pulls every linked fill's top plate to match. */
export function syncFillTopsToFoundations(
  fillInstances: readonly FillInstance[],
  foundationInstances: readonly FoundationInstance[]
): FillInstance[] {
  return fillInstances.map((fill) => {
    const foundation = foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId);
    if (!foundation || foundation.baseElevation === fill.topElevationM) return fill;
    return { ...fill, topElevationM: foundation.baseElevation };
  });
}

/** Called after a fill's topElevationM is directly edited -- pulls its own foundation's base to match, overriding the anchor-connection solve (the user has explicitly chosen a fill-top level; validateFoundationInstance's connection-mismatch rule is what then flags whether the foundation, as configured, still reaches its anchor). */
export function syncFoundationBaseToFill(
  foundationInstances: readonly FoundationInstance[],
  fill: FillInstance
): FoundationInstance[] {
  return foundationInstances.map((f) =>
    f.instanceId === fill.foundationInstanceId && f.baseElevation !== fill.topElevationM
      ? { ...f, baseElevation: fill.topElevationM }
      : f
  );
}

/**
 * Called after a foundation changes (base elevation, type/parameters --
 * anything that can move `topConnectionPoint.z`) -- pulls every linked
 * uplift-fill's top elevation to match the foundation's own top (pad +
 * pedestal/column), the same way syncFillTopsToFoundations pulls the base
 * fill's top to match the foundation's *base*. One-directional only: unlike
 * the base fill, there is no `syncFoundationTopToUpliftFill` counterpart --
 * a foundation has no single stored field corresponding to "top of
 * foundation" to push an edit into (it's derived from parameters), and
 * physically there's no constraint forcing the foundation to match its own
 * cover depth the way it must rest exactly on the base fill. A direct edit
 * of an uplift-fill's top elevation is just a free value.
 */
export function syncUpliftFillTopsToFoundations(
  upliftFillInstances: readonly FillInstance[],
  foundationInstances: readonly FoundationInstance[]
): FillInstance[] {
  return upliftFillInstances.map((fill) => {
    const foundation = foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId);
    if (!foundation) return fill;
    const topElevationM = generateFoundationGeometry(foundation).topConnectionPoint.z;
    if (topElevationM === fill.topElevationM) return fill;
    return { ...fill, topElevationM };
  });
}
