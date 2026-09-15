/**
 * Application-layer service: derives one default foundation instance per
 * structural leg from a pole model, using a foundation type from the
 * library (domain/foundationLibrary.ts). Pure function, no React/Three.js
 * dependency (principle: never embed domain calculations directly inside
 * UI components) -- UI code calls this and stores the result, it does not
 * recompute placement itself.
 *
 * Base elevation is solved generically for any geometry type: generate the
 * type's geometry once with baseElevation=0 to get its own total height
 * (bottom to top-connection-point), then place that height so the top
 * lands exactly on the leg's placed anchor -- no per-geometry-type height
 * formula duplicated here.
 */

import type { FoundationInstance, FoundationParameters, FoundationType } from "../domain/foundation";
import type { PoleModel } from "../domain/poleModel";
import { generateFoundationGeometryFromParameters } from "../geometry/foundationGeometry";
import { placedAnchorPosition } from "../geometry/polePlacement";

function solveBaseElevationForConnection(
  parameters: FoundationParameters,
  position: { x: number; y: number },
  orientationRadians: number,
  targetTopZ: number
): number {
  const trialGeometry = generateFoundationGeometryFromParameters(parameters, {
    position,
    orientationRadians,
    baseElevation: 0,
  });
  const heightFromBaseToTop = trialGeometry.topConnectionPoint.z;
  return targetTopZ - heightFromBaseToTop;
}

export function buildFoundationInstanceForLeg(
  poleModel: PoleModel,
  legId: string,
  foundationType: FoundationType,
  nowIso: string,
  parametersOverride?: FoundationParameters
): FoundationInstance {
  const leg = poleModel.structuralLegs.find((l) => l.id === legId);
  if (!leg) {
    throw new Error(`Leg "${legId}" not found on pole model "${poleModel.modelId}"`);
  }

  const parameters = parametersOverride ?? foundationType.defaultParameters;
  const anchorPos = placedAnchorPosition(leg.linkedFoundationAnchorId, poleModel);
  const position = { x: anchorPos.x, y: anchorPos.y };
  const baseElevation = solveBaseElevationForConnection(parameters, position, 0, anchorPos.z);

  return {
    instanceId: `foundation-${leg.id}`,
    poleModelId: poleModel.modelId,
    legId: leg.id,
    anchorId: leg.linkedFoundationAnchorId,
    foundationTypeId: foundationType.foundationTypeId,
    parameters,
    position,
    orientationRadians: 0,
    baseElevation,
    visible: true,
    colour: foundationType.defaultColour,
    opacity: foundationType.defaultOpacity,
    provenance: {
      originType: parametersOverride ? "user-entered" : "library-default",
      verificationState: "unverified",
      modifiedAt: nowIso,
      notes: parametersOverride
        ? "User-edited foundation dimensions; base elevation calculated to connect to the leg anchor."
        : "Default foundation dimensions and base elevation calculated to connect to the leg anchor; not a verified design.",
    },
  };
}

export function buildDefaultFoundationInstances(
  poleModel: PoleModel,
  foundationType: FoundationType,
  nowIso: string
): FoundationInstance[] {
  return poleModel.structuralLegs.map((leg) =>
    buildFoundationInstanceForLeg(poleModel, leg.id, foundationType, nowIso)
  );
}

/**
 * Rebuilds one instance's geometry-affecting fields (type, parameters,
 * base elevation) while preserving everything else about it (visibility,
 * colour override, opacity, notes) -- used by "change this leg's
 * foundation type" and "copy this foundation's parameters to other legs".
 */
export function withFoundationType(
  instance: FoundationInstance,
  poleModel: PoleModel,
  foundationType: FoundationType,
  nowIso: string,
  parametersOverride?: FoundationParameters
): FoundationInstance {
  const parameters = parametersOverride ?? foundationType.defaultParameters;
  const anchorPos = placedAnchorPosition(instance.anchorId, poleModel);
  const baseElevation = solveBaseElevationForConnection(
    parameters,
    instance.position,
    instance.orientationRadians,
    anchorPos.z
  );

  return {
    ...instance,
    foundationTypeId: foundationType.foundationTypeId,
    parameters,
    baseElevation,
    provenance: {
      ...instance.provenance,
      originType: parametersOverride ? "user-entered" : "library-default",
      modifiedAt: nowIso,
    },
  };
}

