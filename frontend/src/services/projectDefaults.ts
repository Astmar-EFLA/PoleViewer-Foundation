import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import type { SectionDefinition } from "../domain/section";

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
      plane: { originX: 0, originY: 0, directionRadians: Math.PI / 2 },
      pointToleranceM: DEFAULT_SECTION_POINT_TOLERANCE_M,
      visible: true,
    },
    {
      id: "section-transverse",
      name: "Transverse (through mast centre)",
      mode: "transverse",
      legId: null,
      plane: { originX: 0, originY: 0, directionRadians: 0 },
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
