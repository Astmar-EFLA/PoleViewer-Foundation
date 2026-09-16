import { z } from "zod";
import type { PoleModel } from "../domain/poleModel";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { localCoordinateSchema, provenanceSchema } from "./sharedSchemas";

// Note: this schema is intentionally not constrained with `satisfies
// z.ZodType<PoleModel>`. Zod's `.optional()` produces `T | undefined`
// (property always present), which conflicts with this project's
// `exactOptionalPropertyTypes` domain types (`field?: T`, property may be
// absent) -- a known friction point between Zod and that compiler option,
// not a real type-safety gap. Correctness is instead guaranteed at runtime
// by `poleModelSchema.safeParse` in `parsePoleModel` below; keep the field
// list here in sync with domain/poleModel.ts by hand.

const anchorTypeSchema = z.enum([
  "mast-centre",
  "leg-to-foundation",
  "pole-base",
  "pedestal-connection",
  "guy-attachment",
  "guy-ground-anchor",
  "cross-arm-reference",
  "conductor-attachment",
  "local-alignment-reference",
  "custom",
]);

const anchorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  anchorType: anchorTypeSchema,
  localPosition: localCoordinateSchema,
  linkedLegId: z.string().optional(),
  source: provenanceSchema,
  verificationState: z.enum(["unverified", "verified", "rejected"]),
  notes: z.string().optional(),
});

const structuralLegSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  linkedFoundationAnchorId: z.string().min(1),
  source: provenanceSchema,
});

const poleMemberSchema = z.object({
  a: localCoordinateSchema,
  b: localCoordinateSchema,
  category: z.enum(["structure", "cable", "insulator"]),
  component: z.string(),
});

const poleVisualGeometrySchema = z.object({
  members: z.array(poleMemberSchema),
  source: provenanceSchema,
});

export const poleModelSchema = z.object({
  schemaVersion: z.string().min(1),
  modelId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  source: provenanceSchema,
  units: z.enum(["m", "ft", "us-ft"]),
  coordinateConvention: z.literal("right-handed-x-transverse-y-longitudinal-z-up"),
  localOrigin: localCoordinateSchema,
  modelOrientationRadians: z.number().finite(),
  mastCentreAnchorId: z.string().min(1),
  visualAssetRef: z.string().optional(),
  anchors: z.array(anchorSchema).min(1, "a pole model must declare at least one anchor"),
  structuralLegs: z
    .array(structuralLegSchema)
    .min(1, "a pole model must declare at least one structural leg"),
  metadata: z.record(z.unknown()).optional(),
  warnings: z.array(z.string()),
  visualGeometry: poleVisualGeometrySchema.optional(),
});

/**
 * Structural (shape/type) validation only. Reference-integrity checks
 * (duplicate anchor ids, dangling anchor references, etc.) are a separate
 * step -- see poleModelValidation.ts -- because those are domain rules, not
 * JSON-shape rules, and must produce ValidationResult objects the UI can
 * show alongside every other validation category (ADR-010).
 */
export function parsePoleModel(input: unknown): ParseResult<PoleModel> {
  return fromZodSafeParse(poleModelSchema.safeParse(input)) as ParseResult<PoleModel>;
}
