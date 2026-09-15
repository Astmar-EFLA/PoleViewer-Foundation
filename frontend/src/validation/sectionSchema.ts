import { z } from "zod";

export const sectionPlaneSchema = z.object({
  originX: z.number().finite(),
  originY: z.number().finite(),
  directionRadians: z.number().finite(),
});

export const sectionDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["longitudinal", "transverse", "leg", "custom"]),
  legId: z.string().min(1).nullable(),
  plane: sectionPlaneSchema,
  pointToleranceM: z.number().finite().nonnegative(),
  visible: z.boolean(),
});
