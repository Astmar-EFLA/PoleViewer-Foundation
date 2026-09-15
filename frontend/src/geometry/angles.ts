/**
 * Pure angle-unit conversion functions. Internal storage is always radians
 * (see docs/architecture/coordinate-strategy.md); these functions are the
 * only place unit conversion at the UI boundary is allowed to happen.
 */

const GON_PER_FULL_TURN = 400;
const DEGREES_PER_FULL_TURN = 360;

export function degreesToRadians(degrees: number): number {
  return (degrees / DEGREES_PER_FULL_TURN) * 2 * Math.PI;
}

export function radiansToDegrees(radians: number): number {
  return (radians / (2 * Math.PI)) * DEGREES_PER_FULL_TURN;
}

export function gonToRadians(gon: number): number {
  return (gon / GON_PER_FULL_TURN) * 2 * Math.PI;
}

export function radiansToGon(radians: number): number {
  return (radians / (2 * Math.PI)) * GON_PER_FULL_TURN;
}

/** Normalises an angle in radians to the range [0, 2*PI). */
export function normalizeRadians(radians: number): number {
  const fullTurn = 2 * Math.PI;
  const wrapped = radians % fullTurn;
  return wrapped < 0 ? wrapped + fullTurn : wrapped;
}
