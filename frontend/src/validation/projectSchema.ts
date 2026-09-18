import { z } from "zod";
import type { Project } from "../domain/project";
import { excavationInstanceSchema } from "./excavationSchema";
import { fillInstanceSchema } from "./fillSchema";
import { foundationInstanceSchema } from "./foundationSchema";
import { geotechLayerSchema, groundwaterSchema } from "./geotechSchema";
import { measurementSchema } from "./measurementSchema";
import type { ParseResult } from "./parseResult";
import { fromZodSafeParse } from "./parseResult";
import { poleModelSchema } from "./poleModelSchema";
import { pointCloudSourceReferenceSchema, terrainGenerationSettingsSchema } from "./pointCloudSchema";
import { sectionDefinitionSchema } from "./sectionSchema";
import { crsSchema, lengthUnitSchema, localCoordinateSchema, projectCoordinateSchema } from "./sharedSchemas";
import { terrainSurfaceSchema } from "./terrainSchema";

const layerStyleSchema = z.object({
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
});

const terrainLayerStyleSchema = layerStyleSchema.extend({
  showPoints: z.boolean(),
  wireframe: z.boolean(),
  // .default(...) so a project saved before these options existed still opens cleanly.
  showContours: z.boolean().default(false),
  contourIntervalM: z.number().positive().nullable().default(null),
});

const orthophotoWorldFileSchema = z.object({
  pixelSizeX: z.number().finite(),
  rotationY: z.number().finite(),
  rotationX: z.number().finite(),
  pixelSizeY: z.number().finite(),
  upperLeftX: z.number().finite(),
  upperLeftY: z.number().finite(),
});

const orthophotoReferenceSchema = z.object({
  imagePath: z.string().min(1),
  imageUrl: z.string().min(1),
  imageWidthPx: z.number().int().positive(),
  imageHeightPx: z.number().int().positive(),
  worldFile: orthophotoWorldFileSchema,
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
  excavationInstances: z.array(excavationInstanceSchema),
  // .default([]) so a project saved before this feature existed still opens cleanly.
  fillInstances: z.array(fillInstanceSchema).default([]),
  upliftFillInstances: z.array(fillInstanceSchema).default([]),
  geotechLayers: z.array(geotechLayerSchema),
  groundwater: groundwaterSchema.nullable(),
  pointCloudSource: pointCloudSourceReferenceSchema.nullable(),
  terrainGenerationSettings: terrainGenerationSettingsSchema,
  terrainSurface: terrainSurfaceSchema.nullable(),
  // .nullable().default(null) so a project saved before this feature existed still opens cleanly.
  orthophoto: orthophotoReferenceSchema.nullable().default(null),
  layerStyles: z.object({
    pole: layerStyleSchema,
    foundations: layerStyleSchema,
    terrain: terrainLayerStyleSchema,
    // .default(...) so a project saved before this option existed still opens cleanly.
    orthophoto: layerStyleSchema.default({ visible: false, opacity: 1 }),
  }),
  sections: z.array(sectionDefinitionSchema),
  measurements: z.array(measurementSchema),
  geometryVersion: z.number().int().nonnegative(),
  notes: z.string(),
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
