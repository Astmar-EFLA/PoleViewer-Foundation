/**
 * A whole transmission line's mast list, imported from a CSV the user
 * prepares themselves (spec: name/X/Y/Z/model-path/bearing-layer-depth/
 * groundwater-depth per row, row order = line order low-to-high). Parsed
 * entirely client-side -- this never needs the backend, unlike .pol/.las
 * imports, since a handful of numeric columns needs no PDAL-grade
 * processing. Header format is fixed and documented, not fuzzy-matched
 * (spec decision -- see the plan this was built from).
 */

import type { ProjectCoordinate } from "../domain/coordinates";
import { projectCoordinate } from "../domain/coordinates";
import type { ParseResult } from "../validation/parseResult";

/** Structurally identical to geometry/centreline.ts's PolylinePoint -- not imported directly to avoid a service->geometry->service cycle. */
export interface LegAxisPoint {
  readonly easting: number;
  readonly northing: number;
}

export interface LineMastRow {
  readonly mastName: string;
  readonly position: ProjectCoordinate;
  readonly modelPath: string;
  readonly bearingLayerDepthM: number;
  readonly groundwaterDepthM: number;
  /**
   * Two surveyed leg coordinates used directly as the tower's orientation
   * (geometry/centreline.ts's bearingForMast: bearing = bearingBetween(a,
   * b), no further disambiguation). Order is a REQUIRED, meaningful
   * convention, not an arbitrary pair: `a` must be the world position of
   * the leg the imported pole model places at local (0, negative-Y) --
   * "LP" for this line's guyed H-frame structures -- and `b` the leg at
   * local (0, positive-Y) -- "RP". Confirmed against 6 real,
   * geographically-spread mast models: every one places LP/RP exactly on
   * local +/-Y with modelOrientationRadians at its default (0), so world
   * bearing(a -> b) *is* the correct lineBearingRadians with nothing left
   * to resolve. Getting a/b backwards introduces an exact 180-degree
   * error; supplying legs that *aren't* the model's own local Y pair (e.g.
   * a transverse pair on a differently-labelled structure) will silently
   * produce a wrong bearing, since there is no way to detect that from the
   * coordinates alone. When present this is the most accurate source of
   * orientation available -- real survey data, not an assumption about
   * the tower following the line's centreline or a straight mast-to-mast
   * bearing -- so it takes priority over both. Null when the CSV doesn't
   * supply it for this row (all four columns optional; a partial set is a
   * validation error, not a silent partial guess).
   */
  readonly legAxis: { readonly a: LegAxisPoint; readonly b: LegAxisPoint } | null;
}

const REQUIRED_COLUMNS = [
  "mastName",
  "easting",
  "northing",
  "elevation",
  "modelPath",
  "bearingLayerDepthM",
  "groundwaterDepthM",
] as const;

const LEG_AXIS_COLUMNS = ["legAEasting", "legANorthing", "legBEasting", "legBNorthing"] as const;

/** Splits one CSV line into fields, honouring double-quoted fields that may contain commas or escaped ("") quotes -- anything beyond that (embedded newlines, alternate delimiters) is out of scope. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

function parseRequiredNumber(value: string | undefined, columnName: string, rowNumber: number): number | string {
  if (value === undefined || value.trim() === "") return `row ${rowNumber}: "${columnName}" is required`;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : `row ${rowNumber}: "${columnName}" is not a valid number ("${value}")`;
}

/** Unlike parseRequiredNumber, a blank/missing value is valid here (returns null) -- these columns are optional per row. */
function parseOptionalNumber(value: string | undefined, columnName: string, rowNumber: number): number | null | string {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : `row ${rowNumber}: "${columnName}" is not a valid number ("${value}")`;
}

export function parseLineMastCsv(text: string): ParseResult<LineMastRow[]> {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { success: false, errors: ["The CSV file is empty."] };
  }

  const header = splitCsvLine(lines[0]!);
  const columnIndex = new Map(header.map((name, i) => [name, i]));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !columnIndex.has(c));
  if (missingColumns.length > 0) {
    return {
      success: false,
      errors: [
        `Missing required column(s): ${missingColumns.join(", ")}. Expected header: ${REQUIRED_COLUMNS.join(",")}`,
      ],
    };
  }

  const errors: string[] = [];
  const rows: LineMastRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rowNumber = i + 1; // 1-based, matching what a spreadsheet would show
    const fields = splitCsvLine(lines[i]!);
    const get = (column: string): string | undefined => {
      const idx = columnIndex.get(column);
      return idx === undefined ? undefined : fields[idx];
    };

    const mastName = get("mastName");
    const modelPath = get("modelPath");
    if (!mastName) errors.push(`row ${rowNumber}: "mastName" is required`);
    if (!modelPath) errors.push(`row ${rowNumber}: "modelPath" is required`);

    const easting = parseRequiredNumber(get("easting"), "easting", rowNumber);
    const northing = parseRequiredNumber(get("northing"), "northing", rowNumber);
    const elevation = parseRequiredNumber(get("elevation"), "elevation", rowNumber);
    const bearingLayerDepthM = parseRequiredNumber(get("bearingLayerDepthM"), "bearingLayerDepthM", rowNumber);
    const groundwaterDepthM = parseRequiredNumber(get("groundwaterDepthM"), "groundwaterDepthM", rowNumber);

    for (const v of [easting, northing, elevation, bearingLayerDepthM, groundwaterDepthM]) {
      if (typeof v === "string") errors.push(v);
    }

    const legAEasting = parseOptionalNumber(get("legAEasting"), "legAEasting", rowNumber);
    const legANorthing = parseOptionalNumber(get("legANorthing"), "legANorthing", rowNumber);
    const legBEasting = parseOptionalNumber(get("legBEasting"), "legBEasting", rowNumber);
    const legBNorthing = parseOptionalNumber(get("legBNorthing"), "legBNorthing", rowNumber);

    for (const v of [legAEasting, legANorthing, legBEasting, legBNorthing]) {
      if (typeof v === "string") errors.push(v);
    }

    const legAxisValues = [legAEasting, legANorthing, legBEasting, legBNorthing];
    const legAxisProvidedCount = legAxisValues.filter((v) => v !== null).length;
    let legAxis: LineMastRow["legAxis"] = null;
    if (legAxisProvidedCount > 0 && legAxisProvidedCount < LEG_AXIS_COLUMNS.length) {
      errors.push(
        `row ${rowNumber}: leg axis coordinates (${LEG_AXIS_COLUMNS.join(", ")}) must be given as a complete set or left entirely blank`
      );
    } else if (
      typeof legAEasting === "number" &&
      typeof legANorthing === "number" &&
      typeof legBEasting === "number" &&
      typeof legBNorthing === "number"
    ) {
      legAxis = { a: { easting: legAEasting, northing: legANorthing }, b: { easting: legBEasting, northing: legBNorthing } };
    }

    if (
      mastName &&
      modelPath &&
      typeof easting === "number" &&
      typeof northing === "number" &&
      typeof elevation === "number" &&
      typeof bearingLayerDepthM === "number" &&
      typeof groundwaterDepthM === "number" &&
      (legAxisProvidedCount === 0 || legAxisProvidedCount === LEG_AXIS_COLUMNS.length)
    ) {
      rows.push({
        mastName,
        position: projectCoordinate(easting, northing, elevation),
        modelPath,
        bearingLayerDepthM,
        groundwaterDepthM,
        legAxis,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (rows.length === 0) {
    return { success: false, errors: ["The CSV has a header row but no mast rows."] };
  }
  return { success: true, data: rows };
}
