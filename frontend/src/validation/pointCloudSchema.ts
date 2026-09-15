import { z } from "zod";
import { crsSchema } from "./sharedSchemas";

export const pointCloudSourceReferenceSchema = z.object({
  filePath: z.string().min(1),
  crs: crsSchema,
});

const rectangularClipBoundarySettingsSchema = z.object({
  widthM: z.number().positive(),
  lengthM: z.number().positive(),
  centerOffsetLocal: z.object({ x: z.number().finite(), y: z.number().finite() }),
  rotationRadians: z.number().finite(),
});

export const terrainGenerationSettingsSchema = z.object({
  maxEdgeLengthM: z.number().positive(),
  classificationFilter: z.array(z.number().int()).nullable(),
  decimationStep: z.number().int().positive().nullable(),
  clipBoundary: rectangularClipBoundarySettingsSchema,
});
