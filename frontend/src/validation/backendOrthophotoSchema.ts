import { z } from "zod";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";

/** Validates responses from the backend's /orthophoto/* endpoints -- see validation/backendPointCloudSchema.ts for why a same-codebase response is still validated, not trusted blindly. */

const processingWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(["information", "warning", "blocking"]),
  message: z.string(),
});

const orthophotoWorldFileSchema = z.object({
  pixelSizeX: z.number().finite(),
  rotationY: z.number().finite(),
  rotationX: z.number().finite(),
  pixelSizeY: z.number().finite(),
  upperLeftX: z.number().finite(),
  upperLeftY: z.number().finite(),
});

export const orthophotoRegisterResultSchema = z.object({
  imageUrl: z.string().min(1),
  imageWidthPx: z.number().int().positive(),
  imageHeightPx: z.number().int().positive(),
  worldFile: orthophotoWorldFileSchema,
  warnings: z.array(processingWarningSchema),
});

export type BackendOrthophotoRegisterResult = z.infer<typeof orthophotoRegisterResultSchema>;

export function parseOrthophotoRegisterResult(input: unknown): ParseResult<BackendOrthophotoRegisterResult> {
  return fromZodSafeParse(orthophotoRegisterResultSchema.safeParse(input)) as ParseResult<BackendOrthophotoRegisterResult>;
}
