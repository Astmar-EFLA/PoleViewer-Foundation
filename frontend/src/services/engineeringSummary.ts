import type { CoordinateReferenceSystem } from "../domain/coordinates";
import type { Provenance, ProvenanceOriginType, VerificationState } from "../domain/provenance";
import type { Project } from "../domain/project";
import { radiansToDegrees } from "../geometry/angles";

/**
 * The four buckets spec section 20 requires an engineering parameter
 * summary to separate values into. `library-default` folds into "assumed"
 * (an unconfirmed default, not a real engineering decision); `transformed`
 * and `interpolated` fold into "calculated" (both are derived from other
 * data by a defined procedure, not entered or assumed directly).
 */
export type SummaryBucket = "imported" | "user-entered" | "assumed" | "calculated";

export function bucketForOriginType(originType: ProvenanceOriginType): SummaryBucket {
  switch (originType) {
    case "imported":
      return "imported";
    case "user-entered":
      return "user-entered";
    case "assumed":
    case "library-default":
      return "assumed";
    case "calculated":
    case "transformed":
    case "interpolated":
      return "calculated";
  }
}

export interface EngineeringSummaryEntry {
  readonly label: string;
  readonly value: string;
  readonly bucket: SummaryBucket;
  readonly verificationState: VerificationState;
  readonly notes?: string;
}

/** A project-level value with no per-field provenance tracked yet (see note in buildEngineeringSummary) -- listed separately, never guessed into one of the four buckets. */
export interface ProjectConfigurationEntry {
  readonly label: string;
  readonly value: string;
}

export interface EngineeringSummary {
  readonly entries: readonly EngineeringSummaryEntry[];
  readonly projectConfiguration: readonly ProjectConfigurationEntry[];
}

function entryFromProvenance(label: string, value: string, provenance: Provenance): EngineeringSummaryEntry {
  return {
    label,
    value,
    bucket: bucketForOriginType(provenance.originType),
    verificationState: provenance.verificationState,
    ...(provenance.notes !== undefined ? { notes: provenance.notes } : {}),
  };
}

function describeCrs(crs: CoordinateReferenceSystem): string {
  switch (crs.kind) {
    case "epsg":
      return `EPSG:${crs.epsgCode}`;
    case "explicit":
      return crs.definition;
    case "unknown":
      return "unknown (not set)";
  }
}

/**
 * Builds a flat, exportable engineering parameter summary from the
 * project's own provenance metadata -- never re-derives or guesses a
 * classification, only reads what each object already declares.
 *
 * Mast centre, line bearing, and terrain-generation settings do not yet
 * carry their own per-field Provenance in the domain model (only the
 * per-object values added from Phase 4 onward do: foundations, excavations,
 * geotech layers, groundwater, and the pole model itself). Rather than
 * assume a bucket for them, they are listed under `projectConfiguration`
 * instead -- an honest gap, not a silent guess.
 */
export function buildEngineeringSummary(project: Project): EngineeringSummary {
  const entries: EngineeringSummaryEntry[] = [];

  entries.push(
    entryFromProvenance(`Pole model "${project.poleModel.name}"`, project.poleModel.modelId, project.poleModel.source)
  );

  for (const f of project.foundationInstances) {
    entries.push(
      entryFromProvenance(
        `Foundation ${f.displayLabel} (${f.foundationTypeId})`,
        `base elevation ${f.baseElevation.toFixed(3)} m local`,
        f.provenance
      )
    );
  }

  for (const e of project.excavationInstances) {
    entries.push(
      entryFromProvenance(
        `Excavation ${e.id}`,
        `bottom ${e.bottomElevationM.toFixed(3)} m local, working space ${e.workingSpaceOffsetM} m, slope ${e.sideSlope.h}:${e.sideSlope.v} (H:V)`,
        e.provenance
      )
    );
  }

  for (const l of project.geotechLayers) {
    entries.push(entryFromProvenance(`Geotechnical layer "${l.name}"`, l.category, l.source));
  }

  if (project.groundwater) {
    entries.push(entryFromProvenance(`Groundwater "${project.groundwater.name}"`, "water table", project.groundwater.source));
  }

  const projectConfiguration: ProjectConfigurationEntry[] = [
    {
      label: "Mast centre (project coordinates)",
      value: `E=${project.mastCentreProject.easting.toFixed(3)} N=${project.mastCentreProject.northing.toFixed(3)} El=${project.mastCentreProject.elevation.toFixed(3)}`,
    },
    { label: "Line bearing", value: `${radiansToDegrees(project.lineBearingRadians).toFixed(2)} deg` },
    { label: "CRS", value: describeCrs(project.crs) },
    { label: "Elevation reference", value: project.elevationReferenceType },
  ];
  if (project.pointCloudSource) {
    projectConfiguration.push({
      label: "Point-cloud source",
      value: `${project.pointCloudSource.filePath}${project.pointCloudSource.contentHash ? ` (hash confirmed)` : " (hash not yet confirmed)"}`,
    });
  }

  return { entries, projectConfiguration };
}
