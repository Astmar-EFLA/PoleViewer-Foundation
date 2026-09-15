import { z } from "zod";
import type { FoundationInstance } from "../domain/foundation";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { provenanceSchema } from "./sharedSchemas";

export const rectangularPadPedestalParametersSchema = z.object({
  padWidth: z.number().finite(),
  padLength: z.number().finite(),
  padThickness: z.number().finite(),
  pedestalWidth: z.number().finite(),
  pedestalLength: z.number().finite(),
  pedestalHeight: z.number().finite(),
});

export const foundationInstanceSchema = z.object({
  instanceId: z.string().min(1),
  poleModelId: z.string().min(1),
  legId: z.string().min(1),
  anchorId: z.string().min(1),
  foundationTypeId: z.string().min(1),
  parameters: rectangularPadPedestalParametersSchema,
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
