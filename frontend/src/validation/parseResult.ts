import type { SafeParseReturnType } from "zod";

export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: readonly string[] };

export function fromZodSafeParse<T>(result: SafeParseReturnType<unknown, T>): ParseResult<T> {
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
}
