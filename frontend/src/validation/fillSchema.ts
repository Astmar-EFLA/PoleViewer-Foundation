import { z } from "zod";
import { sideSlopeSchema } from "./excavationSchema";
import { provenanceSchema } from "./sharedSchemas";

// sideSlopeSchema (H:V) is a generic slope shape, not excavation-specific --
// reused here as-is rather than duplicated.

export const fillInstanceSchema = z.object({
  id: z.string().min(1),
  foundationInstanceId: z.string().min(1),
  topElevationM: z.number().finite(),
  workingSpaceOffsetM: z.number().finite(),
  sideSlope: sideSlopeSchema,
  colour: z.string().min(1),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  wireframe: z.boolean(),
  provenance: provenanceSchema,
});
