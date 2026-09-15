import type { PoleModel } from "../domain/poleModel";
import type { ValidationResult } from "../domain/validation";

/**
 * Domain-level (reference-integrity) checks for a pole model, run after
 * Zod schema parsing has already confirmed the shape is valid. Covers the
 * "pole validation" checks listed in the requirements: duplicate anchors,
 * missing mast centre, invalid anchor references, missing leg-to-foundation
 * anchors.
 */
export function validatePoleModelReferences(
  poleModel: PoleModel,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const anchorIds = poleModel.anchors.map((a) => a.id);
  const anchorIdSet = new Set(anchorIds);

  const duplicateIds = anchorIds.filter((id, index) => anchorIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    results.push({
      ruleId: "pole.duplicate-anchor-id",
      severity: "blocking",
      affectedObjectIds: [...new Set(duplicateIds)],
      title: "Duplicate anchor IDs",
      detail: `Anchor IDs must be unique within a pole model. Duplicated: ${[
        ...new Set(duplicateIds),
      ].join(", ")}`,
      timestamp: nowIso,
      dataVersion: poleModel.schemaVersion,
      status: "open",
    });
  }

  if (!anchorIdSet.has(poleModel.mastCentreAnchorId)) {
    results.push({
      ruleId: "pole.missing-mast-centre-anchor",
      severity: "blocking",
      affectedObjectIds: [poleModel.modelId],
      title: "Mast centre anchor not found",
      detail: `mastCentreAnchorId "${poleModel.mastCentreAnchorId}" does not match any declared anchor id.`,
      timestamp: nowIso,
      dataVersion: poleModel.schemaVersion,
      status: "open",
    });
  }

  for (const leg of poleModel.structuralLegs) {
    if (!anchorIdSet.has(leg.linkedFoundationAnchorId)) {
      results.push({
        ruleId: "pole.invalid-leg-anchor-reference",
        severity: "blocking",
        affectedObjectIds: [leg.id],
        title: "Leg references a missing anchor",
        detail: `Structural leg "${leg.name}" (${leg.id}) references linkedFoundationAnchorId "${leg.linkedFoundationAnchorId}", which does not match any declared anchor id.`,
        timestamp: nowIso,
        dataVersion: poleModel.schemaVersion,
        status: "open",
      });
    }
  }

  const legIds = poleModel.structuralLegs.map((l) => l.id);
  const duplicateLegIds = legIds.filter((id, index) => legIds.indexOf(id) !== index);
  if (duplicateLegIds.length > 0) {
    results.push({
      ruleId: "pole.duplicate-leg-id",
      severity: "blocking",
      affectedObjectIds: [...new Set(duplicateLegIds)],
      title: "Duplicate structural leg IDs",
      detail: `Structural leg IDs must be unique within a pole model. Duplicated: ${[
        ...new Set(duplicateLegIds),
      ].join(", ")}`,
      timestamp: nowIso,
      dataVersion: poleModel.schemaVersion,
      status: "open",
    });
  }

  return results;
}
