/**
 * A single ground point in local engineering coordinates. This is the
 * *source* value -- a TIN vertex is always exactly one of these, never a
 * resampled/averaged value (principle: never treat interpolated terrain as
 * measured terrain where point data is absent; spec section 9's
 * measured-vs-interpolated distinction).
 */
export interface TerrainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TerrainTriangle {
  readonly indices: readonly [number, number, number];
}

export interface TerrainSurface {
  readonly points: readonly TerrainPoint[];
  readonly triangles: readonly TerrainTriangle[];
  readonly maxEdgeLengthM: number;
  readonly rejectedTriangleCount: number;
  readonly duplicatePointCount: number;
  /** ISO 8601 */
  readonly generatedAt: string;
  readonly terrainVersion: string;
}

export type ElevationQuerySource = "point" | "interpolated" | "no-data";

export interface ElevationQueryResult {
  readonly source: ElevationQuerySource;
  readonly elevation: number | null;
  readonly triangleIndex?: number;
  readonly pointIndex?: number;
}
