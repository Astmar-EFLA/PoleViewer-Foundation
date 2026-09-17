/**
 * Maps a world-space (easting, northing) to a texture UV coordinate for
 * draping an orthophoto onto the terrain TIN (rendering/TerrainMesh.tsx).
 * Pure functions, no React/Three dependency, same convention as every other
 * geometry/ module.
 */
import type { OrthophotoWorldFile } from "../domain/orthophoto";

export interface PixelCoordinate {
  readonly col: number;
  readonly row: number;
}

/**
 * Inverts the world file's forward affine transform
 * (easting = A*col + B*row + C, northing = D*col + E*row + F) to recover
 * the (col, row) a given world coordinate falls at. Returns null for a
 * degenerate (zero-determinant) transform rather than dividing by zero --
 * callers already reject this at registration time
 * (orthophoto_import.py's parse_world_file), so this is a defensive
 * fallback, not the primary guard.
 */
export function worldToPixel(worldFile: OrthophotoWorldFile, easting: number, northing: number): PixelCoordinate | null {
  const { pixelSizeX: a, rotationY: d, rotationX: b, pixelSizeY: e, upperLeftX: c, upperLeftY: f } = worldFile;
  const determinant = a * e - b * d;
  if (Math.abs(determinant) < 1e-12) return null;

  const dx = easting - c;
  const dy = northing - f;
  const col = (e * dx - b * dy) / determinant;
  const row = (-d * dx + a * dy) / determinant;
  return { col, row };
}

export interface TextureUv {
  readonly u: number;
  readonly v: number;
}

/**
 * (col, row) -> (u, v) in [0, 1] (unclamped -- a vertex outside the
 * orthophoto's coverage simply samples outside [0,1], which Three.js's
 * default clamp-to-edge wrapping handles by repeating the edge pixel rather
 * than wrapping or erroring). v is flipped (1 - row/height) to match
 * Three.js's default texture V axis (0 at the bottom of the image), while
 * row is measured from the top per the world-file/raster convention.
 */
export function computeOrthophotoUv(
  worldFile: OrthophotoWorldFile,
  imageWidthPx: number,
  imageHeightPx: number,
  easting: number,
  northing: number
): TextureUv {
  const pixel = worldToPixel(worldFile, easting, northing);
  if (!pixel) return { u: 0, v: 0 };
  return { u: pixel.col / imageWidthPx, v: 1 - pixel.row / imageHeightPx };
}
