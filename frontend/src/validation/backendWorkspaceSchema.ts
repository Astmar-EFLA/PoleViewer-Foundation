import { z } from "zod";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";

/** Validates responses from the backend's /workspace/* endpoints (a network response is still an external trust boundary -- see backendPointCloudSchema.ts). */

export const fileStatusSchema = z.object({
  filePath: z.string(),
  exists: z.boolean(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().nullable(),
});

export type BackendFileStatus = z.infer<typeof fileStatusSchema>;

export function parseFileStatus(input: unknown): ParseResult<BackendFileStatus> {
  return fromZodSafeParse(fileStatusSchema.safeParse(input)) as ParseResult<BackendFileStatus>;
}

export const uploadResultSchema = z.object({
  filePath: z.string().min(1),
  originalFileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export type BackendUploadResult = z.infer<typeof uploadResultSchema>;

export function parseUploadResult(input: unknown): ParseResult<BackendUploadResult> {
  return fromZodSafeParse(uploadResultSchema.safeParse(input)) as ParseResult<BackendUploadResult>;
}
