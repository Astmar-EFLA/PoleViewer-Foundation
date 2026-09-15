import { z } from "zod";
import { provenanceSchema } from "./sharedSchemas";

export const sideSlopeSchema = z.object({
  h: z.number().finite(),
  v: z.number().finite(),
});

export const excavationInstanceSchema = z.object({
  id: z.string().min(1),
  foundationInstanceId: z.string().min(1),
  bottomElevationM: z.number().finite(),
  workingSpaceOffsetM: z.number().finite(),
  sideSlope: sideSlopeSchema,
  colour: z.string().min(1),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  wireframe: z.boolean(),
  provenance: provenanceSchema,
});
