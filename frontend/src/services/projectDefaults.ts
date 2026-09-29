import type { ExcavationInstance } from "../domain/excavation";
import type { FillInstance } from "../domain/fill";
import { DEFAULT_GRAVEL_PAD_THICKNESS_M, DEFAULT_UPLIFT_FILL_BELOW_TOP_M } from "../domain/fill";
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
 * throughout the app (0.5m working space, 1H:1V slope, dug to the bottom of
 * the default gravel pad under the foundation) -- shared so a freshly-(re)built foundation
 * set gets the same sensible starting point wherever it happens (the demo
 * project, or a foundation set rebuilt after a pole-model import).
 */
export function buildDefaultExcavationInstances(
  foundationInstances: readonly FoundationInstance[]
): ExcavationInstance[] {
  return foundationInstances.map((foundation) => ({
    id: `excavation-${foundation.instanceId}`,
    foundationInstanceId: foundation.instanceId,
    // Dug to the bottom of the gravel pad the foundation sits on (buildDefaultFillInstances).
    bottomElevationM: foundation.baseElevation - DEFAULT_GRAVEL_PAD_THICKNESS_M,
    workingSpaceOffsetM: 0.5,
    // 1H:1V -- the project default (was ADR-009's 1.5H:1V).
    sideSlope: { h: 1, v: 1 },
    colour: "#c9a227",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: bottom elevation at the bottom of a 0.2m gravel pad under the foundation, 0.5m working space, 1H:1V slope.",
    },
  }));
}

/**
 * One gravel pad (malarpúði) per foundation: a DEFAULT_GRAVEL_PAD_THICKNESS_M
 * slab under the foundation's pad, filling the whole excavation floor (see
 * geometry/gravelPadGeometry.ts). Its top is the foundation base; the
 * excavation floor sits at its bottom (buildDefaultExcavationInstances).
 * `sideSlope` is kept for the shared FillInstance shape but unused by a pad.
 */
export function buildDefaultFillInstances(foundationInstances: readonly FoundationInstance[]): FillInstance[] {
  return foundationInstances.map((foundation) => ({
    id: `fill-${foundation.instanceId}`,
    foundationInstanceId: foundation.instanceId,
    topElevationM: foundation.baseElevation,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 2, v: 1 },
    padThicknessM: DEFAULT_GRAVEL_PAD_THICKNESS_M,
    colour: "#8a6d3b",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: 0.2m gravel pad under the foundation, covering the whole excavation floor.",
    },
  }));
}

/**
 * A second, independent fill layer per foundation: backfill over the
 * foundation body -- pad and most of the pedestal/column -- up to
 * DEFAULT_UPLIFT_FILL_BELOW_TOP_M below `topConnectionPoint.z`
 * (geometry/foundationGeometry.ts), so the pedestal stands proud of it, for backfill
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
    topElevationM: generateFoundationGeometry(foundation).topConnectionPoint.z - DEFAULT_UPLIFT_FILL_BELOW_TOP_M,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 2, v: 1 },
    colour: "#6b5a8a",
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: {
      originType: "assumed",
      verificationState: "unverified",
      notes: "Default assumption: top elevation 0.2m below the top of the foundation, 0.5m working space, 2H:1V slope.",
    },
  }));
}
