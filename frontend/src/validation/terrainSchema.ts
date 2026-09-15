import { z } from "zod";
import type { TerrainSurface } from "../domain/terrain";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";

const terrainPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const terrainTriangleSchema = z.object({
  indices: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]),
});

export const terrainSurfaceSchema = z.object({
  points: z.array(terrainPointSchema),
  triangles: z.array(terrainTriangleSchema),
  maxEdgeLengthM: z.number().positive(),
  rejectedTriangleCount: z.number().int().nonnegative(),
  duplicatePointCount: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  terrainVersion: z.string().min(1),
});

export function parseTerrainSurface(input: unknown): ParseResult<TerrainSurface> {
  return fromZodSafeParse(terrainSurfaceSchema.safeParse(input)) as ParseResult<TerrainSurface>;
}
