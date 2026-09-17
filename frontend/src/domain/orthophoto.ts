/**
 * An orthophoto registered against the project (backend:
 * app/processing/orthophoto_import.py), draped onto the terrain TIN as a
 * texture (rendering/TerrainMesh.tsx). The world file's six raw affine
 * coefficients are kept as-is (not reduced to a bounding box) so a
 * per-vertex UV can be computed exactly, including for a rotated/skewed
 * world file (geometry/orthophotoUv.ts).
 */
export interface OrthophotoWorldFile {
  readonly pixelSizeX: number;
  readonly rotationY: number;
  readonly rotationX: number;
  readonly pixelSizeY: number;
  readonly upperLeftX: number;
  readonly upperLeftY: number;
}

export interface OrthophotoReference {
  readonly imagePath: string;
  readonly imageUrl: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly worldFile: OrthophotoWorldFile;
}
