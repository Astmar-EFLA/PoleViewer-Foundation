import { z } from "zod";
import { localCoordinateSchema, projectCoordinateSchema } from "./sharedSchemas";

export const measurementPointRecordSchema = z.object({
  local: localCoordinateSchema,
  project: projectCoordinateSchema,
});

export const measurementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "point-coordinate",
    "horizontal-distance",
    "three-d-distance",
    "vertical-difference",
    "slope",
    "elevation",
    "depth-below-terrain",
    "foundation-to-bearing-layer",
    "foundation-to-groundwater",
  ]),
  label: z.string().min(1),
  points: z.array(measurementPointRecordSchema),
  resultValue: z.number().finite().nullable(),
  resultUnit: z.enum(["m", "ratio", "percent", "degrees"]),
  resultDetail: z.string().optional(),
  relatedObjectIds: z.array(z.string()).optional(),
  geometryVersionAtCalculation: z.number().int().nonnegative(),
  calculatedAtIso: z.string().datetime(),
});
