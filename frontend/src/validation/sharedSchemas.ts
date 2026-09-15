import { z } from "zod";

/**
 * Schemas shared across domain-object schemas (pole model, foundation,
 * project). Kept in one place so `LocalCoordinate`/`Provenance` validation
 * can't silently drift between schemas that embed them.
 */

export const localCoordinateSchema = z.object({
  space: z.literal("local"),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const projectCoordinateSchema = z.object({
  space: z.literal("project"),
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().finite(),
});

export const provenanceSchema = z.object({
  originType: z.enum([
    "imported",
    "user-entered",
    "assumed",
    "transformed",
    "interpolated",
    "calculated",
    "library-default",
  ]),
  sourceFile: z.string().optional(),
  sourceFileHash: z.string().optional(),
  sourceRef: z.string().optional(),
  importedAt: z.string().datetime().optional(),
  modifiedAt: z.string().datetime().optional(),
  calculationMethod: z.string().optional(),
  calculationParameters: z.record(z.unknown()).optional(),
  softwareVersion: z.string().optional(),
  verificationState: z.enum(["unverified", "verified", "rejected"]),
  notes: z.string().optional(),
});

/**
 * "unknown" is a required, explicit choice, never a schema-level default --
 * a project file that omits crs entirely fails to parse rather than
 * silently becoming "unknown" (principle: never silently assume a CRS).
 */
export const crsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("epsg"), epsgCode: z.number().int().positive() }),
  z.object({ kind: z.literal("explicit"), definition: z.string().min(1) }),
  z.object({ kind: z.literal("unknown") }),
]);

export const lengthUnitSchema = z.enum(["m", "ft", "us-ft"]);
