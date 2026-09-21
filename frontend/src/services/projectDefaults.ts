import type { ExcavationInstance } from "../domain/excavation";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { SectionDefinition } from "../domain/section";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";

const DEFAULT_SECTION_POINT_TOLERANCE_M = 1.0;

/**
 * The two sections every project starts with (through the mast centre) --
 * shared between the initial demo project and whatever rebuilds sections
 * after a structural change invalidates the existing ones (e.g. a
 * pole-model import replaces the legs a "selected leg" section pointed
 * at).
 */
export function buildDefaultSections(): SectionDefinition[] {
  return [
    {
      id: "section-longitudinal",
      name: "Longitudinal (through mast centre)",
      mode: "longitudinal",
      legId: null,
      plane: { originX: 0, originY: 0, directionRadians: 0 },
      pointToleranceM: DEFAULT_SECTION_POINT_TOLERANCE_M,
      visible: true,
    },
    {
      id: "section-transverse",
      name: "Transverse (through mast centre)",
      mode: "transverse",
      legId: null,
      plane: { originX: 0, originY: 0, directionRadians: Math.PI / 2 },
      pointToleranceM: DEFAULT_SECTION_POINT_TOLERANCE_M,
      visible: true,
    },
  ];
}

/**
 * One excavation per foundation, using the same default assumptions
 * throughout the app (0.5m working space, 1.5H:1V slope, dug to the
 * foundation's own base level) -- shared so a freshly-(re)built foundation
 * set gets the same sensible starting point wherever it happens (the demo
 * project, or a foundation set rebuilt after a pole-model import).
 */
export function buildDefaultExcavationInstances(
  foundationInstances: readonly FoundationInstance[]
): ExcavationInstance[] {
  return foundationInstances.map((foundation) => ({
    id: `excavation-${foundation.instanceId}`,
    foundationInstanceId: foundation.instanceId,
    bottomElevationM: foundation.baseElevation,
    workingSpaceOffsetM: 0.5,
    // 1.5H:1V, matching ADR-009's default convention (unconfirmed against
    // a real EFLA reference document -- see the ADR).
    sideSlope: { h: 1.5, v: 1 },
    colour: "#c9a227",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: bottom elevation set to the foundation base, 0.5m working space, 1.5H:1V slope.",
    },
  }));
}

/**
 * One fill per foundation, the vertical mirror of
 * buildDefaultExcavationInstances -- for a foundation whose base sits above
 * existing terrain and needs material added to reach it, instead of ground
 * dug away. Visible by default, same as excavation -- the geometry always
 * degrades gracefully (near-zero height/volume) for a leg where it isn't
 * the relevant case, so there's no reason to hide it and make a user find
 * the toggle first.
 */
export function buildDefaultFillInstances(foundationInstances: readonly FoundationInstance[]): FillInstance[] {
  return foundationInstances.map((foundation) => ({
    id: `fill-${foundation.instanceId}`,
    foundationInstanceId: foundation.instanceId,
    topElevationM: foundation.baseElevation,
    workingSpaceOffsetM: 0.5,
    // 2H:1V, a common fill/embankment default -- unconfirmed against a real
    // EFLA reference document, same caveat as excavation's own ADR-009 note.
    sideSlope: { h: 2, v: 1 },
    colour: "#8a6d3b",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: top elevation set to the foundation base, 0.5m working space, 2H:1V slope.",
    },
  }));
}

/**
 * A second, independent fill layer per foundation: instead of reaching up
 * to the foundation's base (buildDefaultFillInstances), this one covers the
 * *whole* foundation body -- pad and pedestal/column both -- up to
 * `topConnectionPoint.z` (geometry/foundationGeometry.ts), for backfill
 * whose weight a geotechnician relies on for uplift resistance. Reuses the
 * exact same `FillInstance` shape, geometry, and volume math as the base
 * fill (its footprint -- the foundation's bottom/widest part -- already
 * contains the narrower column above it, so a constant-footprint prism up
 * to the top covers both without any new footprint logic); only the
 * default top elevation differs. Visible by default, same reasoning as
 * buildDefaultFillInstances.
 */
export function buildDefaultUpliftFillInstances(foundationInstances: readonly FoundationInstance[]): FillInstance[] {
  return foundationInstances.map((foundation) => ({
    id: `uplift-fill-${foundation.instanceId}`,
    foundationInstanceId: foundation.instanceId,
    topElevationM: generateFoundationGeometry(foundation).topConnectionPoint.z,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 2, v: 1 },
    colour: "#6b5a8a",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: top elevation set to the top of the foundation (pad + pedestal/column), 0.5m working space, 2H:1V slope.",
    },
  }));
}
