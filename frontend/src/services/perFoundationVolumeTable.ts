/**
 * Joins the concrete, excavation, fill and uplift-fill quantity results into
 * one row per foundation instance for the report's "volumes per foundation"
 * table. Pure -- kept out of ReportModal so it can be tested. Totals are
 * taken from each service's own totalVolumeM3 (not re-summed here) so the
 * table's totals row always matches the per-material sections below it.
 */

import type { Project } from "../domain/project";
import type { ExcavationMaterialQuantities } from "./excavationMaterialQuantities";
import type { FillMaterialQuantities } from "./fillMaterialQuantities";
import type { FoundationMaterialQuantities, VolumeByFoundation } from "./foundationMaterialQuantities";

export interface PerFoundationVolumeRow {
  readonly foundationInstanceId: string;
  readonly label: string;
  /** Null: no instance of that kind for this foundation, or its volume could not be calculated. */
  readonly concreteM3: number | null;
  readonly excavationM3: number | null;
  readonly fillM3: number | null;
  readonly upliftFillM3: number | null;
}

export interface PerFoundationVolumeTable {
  readonly rows: readonly PerFoundationVolumeRow[];
  readonly totals: {
    readonly concreteM3: number | null;
    readonly excavationM3: number | null;
    readonly fillM3: number | null;
    readonly upliftFillM3: number | null;
  };
}

function volumeLookup(entries: readonly VolumeByFoundation[]): (foundationInstanceId: string) => number | null {
  const byId = new Map(entries.map((e) => [e.foundationInstanceId, e.volumeM3]));
  return (foundationInstanceId) => byId.get(foundationInstanceId) ?? null;
}

export function buildPerFoundationVolumeTable(
  project: Project,
  concrete: FoundationMaterialQuantities,
  excavation: ExcavationMaterialQuantities,
  fill: FillMaterialQuantities,
  upliftFill: FillMaterialQuantities
): PerFoundationVolumeTable {
  const concreteOf = volumeLookup(concrete.byFoundation);
  const excavationOf = volumeLookup(excavation.byFoundation);
  const fillOf = volumeLookup(fill.byFoundation);
  const upliftFillOf = volumeLookup(upliftFill.byFoundation);

  return {
    rows: project.foundationInstances.map((foundation) => ({
      foundationInstanceId: foundation.instanceId,
      label: foundation.displayLabel,
      concreteM3: concreteOf(foundation.instanceId),
      excavationM3: excavationOf(foundation.instanceId),
      fillM3: fillOf(foundation.instanceId),
      upliftFillM3: upliftFillOf(foundation.instanceId),
    })),
    totals: {
      concreteM3: concrete.totalVolumeM3,
      excavationM3: excavation.totalVolumeM3,
      fillM3: fill.totalVolumeM3,
      upliftFillM3: upliftFill.totalVolumeM3,
    },
  };
}
