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

export interface LineMastRow {
  readonly mastName: string;
  readonly position: ProjectCoordinate;
  readonly modelPath: string;
  readonly bearingLayerDepthM: number;
  readonly groundwaterDepthM: number;
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
    const get = (column: (typeof REQUIRED_COLUMNS)[number]) => fields[columnIndex.get(column)!];

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

    if (
      mastName &&
      modelPath &&
      typeof easting === "number" &&
      typeof northing === "number" &&
      typeof elevation === "number" &&
      typeof bearingLayerDepthM === "number" &&
      typeof groundwaterDepthM === "number"
    ) {
      rows.push({
        mastName,
        position: projectCoordinate(easting, northing, elevation),
        modelPath,
        bearingLayerDepthM,
        groundwaterDepthM,
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
