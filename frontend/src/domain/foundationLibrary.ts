import type { FoundationType } from "./foundation";

/**
 * The parametric foundation-type library (spec section 10). A typed,
 * in-code array for now -- exposed only through the accessors below so a
 * later JSON-file-backed or user-editable library can replace the source
 * without changing any caller. Dimensions here are placeholder defaults
 * (origin "library-default", unverified), not a real design; every value a
 * user accepts without editing stays traceable as such via the resulting
 * FoundationInstance's provenance.
 */
export const FOUNDATION_LIBRARY: readonly FoundationType[] = [
  {
    foundationTypeId: "rectangular-pad-pedestal-v1",
    name: "Rectangular pad with pedestal",
    description: "A rectangular spread footing with a rectangular pedestal rising to the leg connection.",
    geometryType: "rectangular-pad-pedestal",
    units: "m",
    defaultParameters: {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    },
    defaultColour: "#9aa5b1",
    defaultOpacity: 1,
    verificationState: "unverified",
    provenance: {
      originType: "library-default",
      verificationState: "unverified",
      notes: "Placeholder library dimensions; not a verified design.",
    },
  },
  {
    foundationTypeId: "stepped-rectangular-v1",
    name: "Stepped rectangular foundation",
    description: "A rectangular footing built from successively narrower stacked tiers.",
    geometryType: "stepped-rectangular",
    units: "m",
    defaultParameters: {
      geometryType: "stepped-rectangular",
      steps: [
        { width: 2.2, length: 2.2, height: 0.4 },
        { width: 1.4, length: 1.4, height: 0.4 },
        { width: 0.6, length: 0.6, height: 0.6 },
      ],
    },
    defaultColour: "#9aa5b1",
    defaultOpacity: 1,
    verificationState: "unverified",
    provenance: {
      originType: "library-default",
      verificationState: "unverified",
      notes: "Placeholder library dimensions; not a verified design.",
    },
  },
];

export function getFoundationTypeById(foundationTypeId: string): FoundationType | undefined {
  return FOUNDATION_LIBRARY.find((t) => t.foundationTypeId === foundationTypeId);
}

export function requireFoundationTypeById(foundationTypeId: string): FoundationType {
  const type = getFoundationTypeById(foundationTypeId);
  if (!type) {
    throw new Error(`Unknown foundation type id: "${foundationTypeId}"`);
  }
  return type;
}
