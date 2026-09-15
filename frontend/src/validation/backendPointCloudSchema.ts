import { z } from "zod";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { crsSchema } from "./sharedSchemas";

/**
 * Validates responses from the backend's /pointcloud/* endpoints. The
 * backend is our own code, but a network response is still an external
 * trust boundary (version drift, a stale build, a malformed body) --
 * validate it rather than trusting the shape blindly (principle: validate
 * all imported data).
 */

const processingWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(["information", "warning", "blocking"]),
  message: z.string(),
});

const classificationCountSchema = z.object({
  classificationCode: z.number().int(),
  pointCount: z.number().int().nonnegative(),
});

const clipResultPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  classification: z.number().int(),
});

const rectangularClipBoundarySchema = z.object({
  shape: z.literal("rectangular"),
  widthM: z.number().positive(),
  lengthM: z.number().positive(),
  centerOffsetLocal: z.object({ x: z.number().finite(), y: z.number().finite() }),
  rotationRadians: z.number().finite(),
});

const clipProcessingMetadataSchema = z.object({
  filePath: z.string(),
  boundary: rectangularClipBoundarySchema,
  classificationFilter: z.array(z.number().int()).nullable(),
  decimationStep: z.number().int().positive().nullable(),
  durationMs: z.number().nonnegative(),
});

export const clipResultSchema = z.object({
  points: z.array(clipResultPointSchema),
  sourcePointCount: z.number().int().nonnegative(),
  clippedPointCount: z.number().int().nonnegative(),
  returnedPointCount: z.number().int().nonnegative(),
  classificationCounts: z.array(classificationCountSchema),
  warnings: z.array(processingWarningSchema),
  processingMetadata: clipProcessingMetadataSchema,
});

export type BackendClipResult = z.infer<typeof clipResultSchema>;

export function parseClipResult(input: unknown): ParseResult<BackendClipResult> {
  return fromZodSafeParse(clipResultSchema.safeParse(input)) as ParseResult<BackendClipResult>;
}

const boundsProjectSchema = z.object({
  minEasting: z.number().finite(),
  maxEasting: z.number().finite(),
  minNorthing: z.number().finite(),
  maxNorthing: z.number().finite(),
  minElevation: z.number().finite(),
  maxElevation: z.number().finite(),
});

export const pointCloudMetadataSchema = z.object({
  filePath: z.string(),
  pointCount: z.number().int().nonnegative(),
  boundsProject: boundsProjectSchema,
  scale: z.tuple([z.number(), z.number(), z.number()]),
  offset: z.tuple([z.number(), z.number(), z.number()]),
  availableDimensions: z.array(z.string()),
  crs: crsSchema,
  classificationCounts: z.array(classificationCountSchema),
  hasRgb: z.boolean(),
  hasReturnInformation: z.boolean(),
  warnings: z.array(processingWarningSchema),
});

export type BackendPointCloudMetadata = z.infer<typeof pointCloudMetadataSchema>;

export function parsePointCloudMetadata(input: unknown): ParseResult<BackendPointCloudMetadata> {
  return fromZodSafeParse(pointCloudMetadataSchema.safeParse(input)) as ParseResult<BackendPointCloudMetadata>;
}
