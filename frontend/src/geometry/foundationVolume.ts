import type { FoundationGeometry, FoundationGeometryPart } from "./foundationGeometry";

/**
 * Prismoidal volume of a rectangular frustum with parallel faces of area
 * `bottomArea` and `topArea` separated by `height` -- the same formula
 * excavationVolume.ts and fillVolume.ts use for their approximate volumes.
 * Exact for a frustum whose faces are similar rectangles.
 */
export function rectangularFrustumVolume(height: number, bottomArea: number, topArea: number): number {
  return (height / 3) * (bottomArea + topArea + Math.sqrt(bottomArea * topArea));
}

function partVolume(part: FoundationGeometryPart): number {
  switch (part.kind) {
    case "box":
      return 8 * part.halfExtents.x * part.halfExtents.y * part.halfExtents.z;
    case "frustum":
      return rectangularFrustumVolume(
        2 * part.halfHeight,
        4 * part.bottomHalfExtents.x * part.bottomHalfExtents.y,
        4 * part.topHalfExtents.x * part.topHalfExtents.y
      );
  }
}

/**
 * Nominal concrete volume of a foundation's own design geometry (sum of its
 * parts, from generateFoundationGeometry). Pure geometry -- no terrain, no
 * deduction for embedded steel/anchor bolts, no blinding layer, no wastage
 * allowance. Never a final construction quantity (spec sections 13/20).
 */
export function computeFoundationConcreteVolume(geometry: FoundationGeometry): number {
  return geometry.parts.reduce((sum, part) => sum + partVolume(part), 0);
}
