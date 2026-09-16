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

function buildFoundationInstance(
  poleModel: PoleModel,
  anchorId: string,
  legId: string | null,
  displayLabel: string,
  instanceIdSuffix: string,
  foundationType: FoundationType,
  nowIso: string,
  parametersOverride?: FoundationParameters
): FoundationInstance {
  const parameters = parametersOverride ?? foundationType.defaultParameters;
  const anchorPos = placedAnchorPosition(anchorId, poleModel);
  const position = { x: anchorPos.x, y: anchorPos.y };
  const baseElevation = solveBaseElevationForConnection(parameters, position, 0, anchorPos.z);

  return {
    instanceId: `foundation-${instanceIdSuffix}`,
    poleModelId: poleModel.modelId,
    legId,
    anchorId,
    displayLabel,
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
        ? "User-edited foundation dimensions; base elevation calculated to connect to the anchor."
        : "Default foundation dimensions and base elevation calculated to connect to the anchor; not a verified design.",
    },
  };
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

  return buildFoundationInstance(
    poleModel,
    leg.linkedFoundationAnchorId,
    leg.id,
    leg.name,
    leg.id,
    foundationType,
    nowIso,
    parametersOverride
  );
}

/**
 * A guy-anchor foundation is not tied to a StructuralLeg (there is no such
 * thing as a "guy leg") -- it connects to a `guy-ground-anchor` anchor,
 * NOT the elevated `guy-attachment` anchor (that's where the guy leaves
 * the pole, still up in the air -- a foundation belongs at the anchor's
 * own ground-level position, a separate node in the source file). `legId`
 * is null on the resulting instance; `anchorId` remains the single source
 * of truth for placement (ADR-005).
 */
export function buildFoundationInstanceForGuyAnchor(
  poleModel: PoleModel,
  anchorId: string,
  foundationType: FoundationType,
  nowIso: string,
  parametersOverride?: FoundationParameters
): FoundationInstance {
  const anchor = poleModel.anchors.find((a) => a.id === anchorId && a.anchorType === "guy-ground-anchor");
  if (!anchor) {
    throw new Error(`Guy-ground-anchor "${anchorId}" not found on pole model "${poleModel.modelId}"`);
  }

  return buildFoundationInstance(
    poleModel,
    anchor.id,
    null,
    anchor.name,
    anchor.id,
    foundationType,
    nowIso,
    parametersOverride
  );
}

export function buildDefaultFoundationInstances(
  poleModel: PoleModel,
  legFoundationType: FoundationType,
  guyFoundationType: FoundationType,
  nowIso: string
): FoundationInstance[] {
  const legInstances = poleModel.structuralLegs.map((leg) =>
    buildFoundationInstanceForLeg(poleModel, leg.id, legFoundationType, nowIso)
  );
  const guyInstances = poleModel.anchors
    .filter((a) => a.anchorType === "guy-ground-anchor")
    .map((a) => buildFoundationInstanceForGuyAnchor(poleModel, a.id, guyFoundationType, nowIso));
  return [...legInstances, ...guyInstances];
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

