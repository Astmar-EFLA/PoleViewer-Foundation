import type { LocalCoordinate } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type {
  FoundationInstance,
  FoundationParameters,
  RectangularPadPedestalParameters,
  SteppedRectangularParameters,
} from "../domain/foundation";

export interface OrientedBox {
  readonly centre: LocalCoordinate;
  readonly halfExtents: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientationRadians: number;
}

export interface FoundationGeometry {
  /** Bottom to top. Rectangular-pad-pedestal produces [pad, pedestal]; stepped-rectangular produces one entry per step. */
  readonly parts: readonly OrientedBox[];
  /** Top face centre of the topmost part -- where this foundation should meet its leg's anchor. */
  readonly topConnectionPoint: LocalCoordinate;
}

export interface PlacementFields {
  readonly position: { readonly x: number; readonly y: number };
  readonly orientationRadians: number;
  readonly baseElevation: number;
}

/**
 * Pure function: a foundation instance's geometry depends only on that
 * instance's own fields. Two instances never share mutable state, so
 * regenerating one instance's geometry never touches another's (principle:
 * changing a foundation affects only that foundation).
 */
export function generateRectangularPadPedestalGeometry(
  params: RectangularPadPedestalParameters,
  placement: PlacementFields
): FoundationGeometry {
  const { padWidth, padLength, padThickness, pedestalWidth, pedestalLength, pedestalHeight } = params;
  const { position, orientationRadians, baseElevation } = placement;

  const padCentreZ = baseElevation + padThickness / 2;
  const pedestalCentreZ = baseElevation + padThickness + pedestalHeight / 2;
  const topConnectionZ = baseElevation + padThickness + pedestalHeight;

  return {
    parts: [
      {
        centre: localCoordinate(position.x, position.y, padCentreZ),
        halfExtents: { x: padWidth / 2, y: padLength / 2, z: padThickness / 2 },
        orientationRadians,
      },
      {
        centre: localCoordinate(position.x, position.y, pedestalCentreZ),
        halfExtents: { x: pedestalWidth / 2, y: pedestalLength / 2, z: pedestalHeight / 2 },
        orientationRadians,
      },
    ],
    topConnectionPoint: localCoordinate(position.x, position.y, topConnectionZ),
  };
}

/** Steps stack bottom to top, each centred on the same (x, y) as the instance's position. */
export function generateSteppedRectangularGeometry(
  params: SteppedRectangularParameters,
  placement: PlacementFields
): FoundationGeometry {
  const { position, orientationRadians, baseElevation } = placement;

  let currentZ = baseElevation;
  const parts: OrientedBox[] = [];
  for (const step of params.steps) {
    const centreZ = currentZ + step.height / 2;
    parts.push({
      centre: localCoordinate(position.x, position.y, centreZ),
      halfExtents: { x: step.width / 2, y: step.length / 2, z: step.height / 2 },
      orientationRadians,
    });
    currentZ += step.height;
  }

  return {
    parts,
    topConnectionPoint: localCoordinate(position.x, position.y, currentZ),
  };
}

export function generateFoundationGeometryFromParameters(
  parameters: FoundationParameters,
  placement: PlacementFields
): FoundationGeometry {
  switch (parameters.geometryType) {
    case "rectangular-pad-pedestal":
      return generateRectangularPadPedestalGeometry(parameters, placement);
    case "stepped-rectangular":
      return generateSteppedRectangularGeometry(parameters, placement);
  }
}

export function generateFoundationGeometry(instance: FoundationInstance): FoundationGeometry {
  return generateFoundationGeometryFromParameters(instance.parameters, {
    position: instance.position,
    orientationRadians: instance.orientationRadians,
    baseElevation: instance.baseElevation,
  });
}
