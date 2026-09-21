import { z } from "zod";
import type { FoundationInstance } from "../domain/foundation";
import type { FoundationType } from "../domain/foundation";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { provenanceSchema } from "./sharedSchemas";

export const rectangularPadPedestalParametersSchema = z.object({
  geometryType: z.literal("rectangular-pad-pedestal"),
  padWidth: z.number().finite(),
  padLength: z.number().finite(),
  padThickness: z.number().finite(),
  pedestalWidth: z.number().finite(),
  pedestalLength: z.number().finite(),
  pedestalHeight: z.number().finite(),
});

export const rectangularStepSchema = z.object({
  width: z.number().finite(),
  length: z.number().finite(),
  height: z.number().finite(),
});

export const steppedRectangularParametersSchema = z.object({
  geometryType: z.literal("stepped-rectangular"),
  steps: z.array(rectangularStepSchema),
});

export const rectangularPadTaperedPedestalParametersSchema = z.object({
  geometryType: z.literal("rectangular-pad-tapered-pedestal"),
  padWidth: z.number().finite(),
  padLength: z.number().finite(),
  padThickness: z.number().finite(),
  frustumHeight: z.number().finite(),
  pedestalWidth: z.number().finite(),
  pedestalLength: z.number().finite(),
  pedestalHeight: z.number().finite(),
});

export const foundationParametersSchema = z.discriminatedUnion("geometryType", [
  rectangularPadPedestalParametersSchema,
  steppedRectangularParametersSchema,
  rectangularPadTaperedPedestalParametersSchema,
]);

export const foundationInstanceSchema = z.object({
  instanceId: z.string().min(1),
  poleModelId: z.string().min(1),
  legId: z.string().min(1).nullable(),
  anchorId: z.string().min(1),
  displayLabel: z.string().min(1),
  foundationTypeId: z.string().min(1),
  parameters: foundationParametersSchema,
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  orientationRadians: z.number().finite(),
  baseElevation: z.number().finite(),
  visible: z.boolean(),
  colour: z.string().min(1),
  opacity: z.number().min(0).max(1),
  provenance: provenanceSchema,
});

export function parseFoundationInstance(input: unknown): ParseResult<FoundationInstance> {
  return fromZodSafeParse(foundationInstanceSchema.safeParse(input)) as ParseResult<FoundationInstance>;
}

/**
 * A library entry's `geometryType` (used to pick which fields the editor
 * shows) must actually agree with `defaultParameters.geometryType` (used to
 * generate its geometry) -- the two are only allowed to drift for a
 * hand-edited JSON file, so this is checked here rather than trusted.
 */
export const foundationTypeSchema = z
  .object({
    foundationTypeId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    geometryType: z.enum(["rectangular-pad-pedestal", "stepped-rectangular", "rectangular-pad-tapered-pedestal"]),
    units: z.literal("m"),
    defaultParameters: foundationParametersSchema,
    defaultColour: z.string().min(1),
    defaultOpacity: z.number().min(0).max(1),
    verificationState: z.enum(["unverified", "verified", "rejected"]),
    provenance: provenanceSchema,
  })
  .refine((t) => t.geometryType === t.defaultParameters.geometryType, {
    message: "geometryType must match defaultParameters.geometryType",
    path: ["geometryType"],
  });

export const foundationLibrarySchema = z.array(foundationTypeSchema);

/**
 * Validates the whole library at once, so a typo anywhere in the
 * hand-editable domain/foundationLibrary.json fails loudly at load time
 * (domain/foundationLibrary.ts throws on an invalid result) -- never a
 * partially-loaded library silently missing an entry, and never a broken
 * entry discovered only when someone happens to select it.
 */
export function parseFoundationLibrary(input: unknown): ParseResult<FoundationType[]> {
  return fromZodSafeParse(foundationLibrarySchema.safeParse(input)) as ParseResult<FoundationType[]>;
}
