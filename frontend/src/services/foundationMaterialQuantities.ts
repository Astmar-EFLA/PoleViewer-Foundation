/**
 * Nominal concrete volume of every foundation instance
 * (geometry/foundationVolume.ts), per foundation plus a project-wide total,
 * for the report's per-foundation volume table. Unlike excavation and fill,
 * this needs no terrain -- it is the foundation's own design geometry only.
 * Same never-a-final-quantity caveat (spec sections 13/20).
 *
 * Also home to VolumeByFoundation, the per-foundation entry shape the
 * excavation and fill quantity services share.
 */

import type { Project } from "../domain/project";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { computeFoundationConcreteVolume } from "../geometry/foundationVolume";

export interface VolumeByFoundation {
  readonly foundationInstanceId: string;
  readonly displayLabel: string;
  /** Null when this foundation's volume could not be calculated (blocked geometry, truncated terrain coverage). */
  readonly volumeM3: number | null;
}

export type FoundationMaterialQuantitiesStatus = "calculated" | "no-foundations";

export interface FoundationMaterialQuantities {
  readonly status: FoundationMaterialQuantitiesStatus;
  /** Sum of every foundation's nominal concrete volume. Null when status != "calculated". */
  readonly totalVolumeM3: number | null;
  /** In project.foundationInstances order. */
  readonly byFoundation: readonly VolumeByFoundation[];
  readonly limitations: readonly string[];
}

const METHOD_LIMITATIONS: readonly string[] = [
  "Concrete volume is the foundation's nominal design geometry only -- no deduction for anchor bolts or embedded steel, no blinding/lean-concrete layer, and no wastage allowance.",
];

/**
 * Adds `volumeM3` to the entry for `foundationInstanceId`, creating it if
 * needed. A null volume marks the entry not-calculated (and stays null) --
 * a partially calculated foundation is reported as not calculated rather
 * than as a misleadingly low number. Shared by the excavation and fill
 * quantity services.
 */
export function addVolumeByFoundation(
  entries: Map<string, VolumeByFoundation>,
  foundationInstanceId: string,
  displayLabel: string,
  volumeM3: number | null
): void {
  const existing = entries.get(foundationInstanceId);
  if (!existing) {
    entries.set(foundationInstanceId, { foundationInstanceId, displayLabel, volumeM3 });
    return;
  }
  const combined = existing.volumeM3 === null || volumeM3 === null ? null : existing.volumeM3 + volumeM3;
  entries.set(foundationInstanceId, { ...existing, volumeM3: combined });
}

export function computeFoundationMaterialQuantities(project: Project): FoundationMaterialQuantities {
  if (project.foundationInstances.length === 0) {
    return { status: "no-foundations", totalVolumeM3: null, byFoundation: [], limitations: [] };
  }

  const byFoundation = project.foundationInstances.map((foundation) => ({
    foundationInstanceId: foundation.instanceId,
    displayLabel: foundation.displayLabel,
    volumeM3: computeFoundationConcreteVolume(generateFoundationGeometry(foundation)),
  }));

  return {
    status: "calculated",
    totalVolumeM3: byFoundation.reduce((sum, f) => sum + f.volumeM3, 0),
    byFoundation,
    limitations: METHOD_LIMITATIONS,
  };
}
