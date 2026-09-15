import { z } from "zod";
import type { Project } from "../domain/project";
import { foundationInstanceSchema } from "./foundationSchema";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { poleModelSchema } from "./poleModelSchema";
import { pointCloudSourceReferenceSchema, terrainGenerationSettingsSchema } from "./pointCloudSchema";
import { crsSchema, lengthUnitSchema, localCoordinateSchema, projectCoordinateSchema } from "./sharedSchemas";
import { terrainSurfaceSchema } from "./terrainSchema";

const layerStyleSchema = z.object({
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
});

const terrainLayerStyleSchema = layerStyleSchema.extend({
  showPoints: z.boolean(),
  wireframe: z.boolean(),
});

export const projectSchema = z.object({
  schemaVersion: z.string().min(1),
  appVersion: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  crs: crsSchema,
  horizontalUnits: lengthUnitSchema,
  verticalUnits: lengthUnitSchema,
  elevationReferenceType: z.enum(["orthometric", "ellipsoidal", "project", "unknown"]),
  mastCentreProject: projectCoordinateSchema,
  lineBearingRadians: z.number().finite(),
  renderOriginLocal: localCoordinateSchema,
  poleModel: poleModelSchema,
  foundationInstances: z.array(foundationInstanceSchema),
  pointCloudSource: pointCloudSourceReferenceSchema.nullable(),
  terrainGenerationSettings: terrainGenerationSettingsSchema,
  terrainSurface: terrainSurfaceSchema.nullable(),
  layerStyles: z.object({
    pole: layerStyleSchema,
    foundations: layerStyleSchema,
    terrain: terrainLayerStyleSchema,
  }),
});

/**
 * Full structural validation of a saved project file. This is the single
 * gate a project must pass on load (spec: "schema validation" in the
 * project test list) -- a project.json that doesn't match is rejected with
 * explicit errors, never partially loaded or silently coerced.
 */
export function parseProject(input: unknown): ParseResult<Project> {
  return fromZodSafeParse(projectSchema.safeParse(input)) as ParseResult<Project>;
}
