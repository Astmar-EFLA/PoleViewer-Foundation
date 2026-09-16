import { z } from "zod";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";

/** Validates responses from the backend's /line/* endpoints -- see validation/backendPointCloudSchema.ts for why a same-codebase response is still validated, not trusted blindly. */

const processingWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(["information", "warning", "blocking"]),
  message: z.string(),
});

const centrelineVertexSchema = z.object({
  easting: z.number().finite(),
  northing: z.number().finite(),
});

export const centrelineResultSchema = z.object({
  vertices: z.array(centrelineVertexSchema),
  warnings: z.array(processingWarningSchema),
});

export type BackendCentrelineResult = z.infer<typeof centrelineResultSchema>;

export function parseCentrelineResult(input: unknown): ParseResult<BackendCentrelineResult> {
  return fromZodSafeParse(centrelineResultSchema.safeParse(input)) as ParseResult<BackendCentrelineResult>;
}
