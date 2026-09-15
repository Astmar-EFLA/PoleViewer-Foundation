import { z } from "zod";
import { provenanceSchema } from "./sharedSchemas";

const terrainRelativeBoundarySchema = z.object({
  method: z.literal("terrain-relative"),
  depthBelowTerrainM: z.number().finite(),
});

const absoluteElevationBoundarySchema = z.object({
  method: z.literal("absolute-elevation"),
  elevationProjectM: z.number().finite(),
});

export const boundaryDefinitionSchema = z.discriminatedUnion("method", [
  terrainRelativeBoundarySchema,
  absoluteElevationBoundarySchema,
]);

const geotechCategorySchema = z.enum([
  "topsoil",
  "organic",
  "fill",
  "loose-soil",
  "dense-soil",
  "competent-bearing",
  "weathered-rock",
  "bedrock",
  "custom",
]);

export const geotechLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: geotechCategorySchema,
  description: z.string().optional(),
  topBoundary: boundaryDefinitionSchema,
  bottomBoundary: boundaryDefinitionSchema,
  colour: z.string().min(1),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  wireframe: z.boolean(),
  source: provenanceSchema,
  notes: z.string().optional(),
});

export const groundwaterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  boundary: boundaryDefinitionSchema,
  colour: z.string().min(1),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  wireframe: z.boolean(),
  source: provenanceSchema,
  notes: z.string().optional(),
});
