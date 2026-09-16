import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { EngineeringSummary, SummaryBucket } from "../services/engineeringSummary";
import { buildEngineeringSummary } from "../services/engineeringSummary";
import type { ExcavationMaterialQuantities } from "../services/excavationMaterialQuantities";
import { computeExcavationMaterialQuantities } from "../services/excavationMaterialQuantities";
import { downloadText } from "../services/browserDownload";
import { useProjectStore } from "../state/projectStore";
import type { ValidationResult, ValidationSeverity } from "../domain/validation";
import { buildProjectValidationSummary } from "../validation/projectReport";

const BUCKET_LABELS: Record<SummaryBucket, string> = {
  imported: "Imported",
  "user-entered": "User-entered",
  assumed: "Assumed",
  calculated: "Calculated",
};

const SEVERITY_LABELS: Record<ValidationSeverity, string> = {
  blocking: "Blocking",
  warning: "Warning",
  information: "Information",
};

const SEVERITY_COLOUR: Record<ValidationSeverity, string> = {
  blocking: "#c02020",
  warning: "#c98a12",
  information: "#3070e0",
};

function formatMaterialQuantitiesAsText(quantities: ExcavationMaterialQuantities): string[] {
  const lines: string[] = ["## Material quantities (excavation)"];
  if (quantities.status === "no-terrain-surface") {
    lines.push("Not calculated -- no terrain surface.");
  } else if (quantities.status === "no-excavations") {
    lines.push("Not calculated -- no excavations.");
  } else {
    lines.push(`Total excavation: ${quantities.totalVolumeM3?.toFixed(1) ?? "-"} m3`);
    for (const c of quantities.byCategory) {
      lines.push(`- ${c.category}: ${c.volumeM3.toFixed(1)} m3`);
    }
    if (quantities.excavationsBlocked > 0) {
      lines.push(
        `${quantities.excavationsBlocked} of ${quantities.excavationsCalculated + quantities.excavationsBlocked} excavation(s) could not be calculated and are excluded from these totals.`
      );
    }
    for (const l of quantities.limitations) lines.push(`(${l})`);
  }
  lines.push("");
  return lines;
}

function formatSummaryAsText(
  summary: EngineeringSummary,
  validation: ValidationResult[],
  materialQuantities: ExcavationMaterialQuantities,
  nowIso: string
): string {
  const lines: string[] = [];
  lines.push(`Engineering parameter and validation summary -- generated ${nowIso}`);
  lines.push("This is a design-support summary, not an approved design or certified quantity.");
  lines.push("");

  lines.push(...formatMaterialQuantitiesAsText(materialQuantities));

  (["imported", "user-entered", "assumed", "calculated"] as SummaryBucket[]).forEach((bucket) => {
    const bucketEntries = summary.entries.filter((e) => e.bucket === bucket);
    if (bucketEntries.length === 0) return;
    lines.push(`## ${BUCKET_LABELS[bucket]}`);
    for (const e of bucketEntries) {
      lines.push(`- ${e.label}: ${e.value} [${e.verificationState}]${e.notes ? ` -- ${e.notes}` : ""}`);
    }
    lines.push("");
  });

  lines.push("## Project configuration (no per-field provenance tracked yet)");
  for (const e of summary.projectConfiguration) {
    lines.push(`- ${e.label}: ${e.value}`);
  }
  lines.push("");

  lines.push("## Validation summary");
  (["blocking", "warning", "information"] as ValidationSeverity[]).forEach((severity) => {
    const results = validation.filter((r) => r.severity === severity);
    lines.push(`${SEVERITY_LABELS[severity]}: ${results.length}`);
    for (const r of results) {
      lines.push(`  - [${r.ruleId}] ${r.title}: ${r.detail}`);
    }
  });
  if (validation.length === 0) {
    lines.push("No active warnings or blocking errors.");
  }

  return lines.join("\n");
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 20,
  width: "min(900px, 90vw)",
  maxHeight: "85vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

const buttonStyle: CSSProperties = {
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};

export function ReportModal() {
  const project = useProjectStore((s) => s.project);
  const reportOpen = useProjectStore((s) => s.reportOpen);
  const setReportOpen = useProjectStore((s) => s.setReportOpen);

  const nowIso = useMemo(() => new Date().toISOString(), [reportOpen]);

  const summary = useMemo(() => (project ? buildEngineeringSummary(project) : null), [project]);
  const validation = useMemo(
    () => (project ? buildProjectValidationSummary(project, nowIso) : []),
    [project, nowIso]
  );
  const materialQuantities = useMemo(
    () => (project ? computeExcavationMaterialQuantities(project) : null),
    [project]
  );

  if (!reportOpen || !project || !summary || !materialQuantities) return null;

  const buckets: SummaryBucket[] = ["imported", "user-entered", "assumed", "calculated"];

  return (
    <div style={overlayStyle} onClick={() => setReportOpen(false)}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Engineering summary &amp; validation report</div>
          <button style={buttonStyle} onClick={() => setReportOpen(false)}>
            Close
          </button>
        </div>
        <div style={{ opacity: 0.7, marginBottom: 12 }}>
          Design-support summary only -- not an approved design or certified construction quantity.
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            style={buttonStyle}
            onClick={() =>
              downloadText(
                JSON.stringify({ generatedAt: nowIso, summary, materialQuantities, validation }, null, 2),
                `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.json`,
                "application/json"
              )
            }
          >
            Export JSON
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              downloadText(
                formatSummaryAsText(summary, validation, materialQuantities, nowIso),
                `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.txt`,
                "text/plain"
              )
            }
          >
            Export text
          </button>
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Material quantities (excavation)</div>
        {materialQuantities.status === "no-terrain-surface" && (
          <div style={{ opacity: 0.7, marginBottom: 16 }}>Not calculated -- no terrain surface.</div>
        )}
        {materialQuantities.status === "no-excavations" && (
          <div style={{ opacity: 0.7, marginBottom: 16 }}>Not calculated -- no excavations.</div>
        )}
        {materialQuantities.status === "calculated" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 4 }}>
              Total excavation: <strong>{materialQuantities.totalVolumeM3?.toFixed(1) ?? "-"} m³</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {materialQuantities.byCategory.map((c) => (
                <li key={c.category}>
                  {c.category}: {c.volumeM3.toFixed(1)} m³
                </li>
              ))}
            </ul>
            {materialQuantities.excavationsBlocked > 0 && (
              <div style={{ color: "#c98a12", marginTop: 4 }}>
                {materialQuantities.excavationsBlocked} of{" "}
                {materialQuantities.excavationsCalculated + materialQuantities.excavationsBlocked} excavation(s)
                could not be calculated and are excluded from these totals.
              </div>
            )}
            {materialQuantities.limitations.map((l, i) => (
              <div key={i} style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
                {l}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Engineering parameters</div>
        {buckets.map((bucket) => {
          const bucketEntries = summary.entries.filter((e) => e.bucket === bucket);
          if (bucketEntries.length === 0) return null;
          return (
            <div key={bucket} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{BUCKET_LABELS[bucket]}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {bucketEntries.map((e, i) => (
                  <li key={i}>
                    {e.label}: {e.value} <span style={{ opacity: 0.6 }}>[{e.verificationState}]</span>
                    {e.notes && <div style={{ opacity: 0.6, fontSize: 11 }}>{e.notes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Project configuration</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {summary.projectConfiguration.map((e, i) => (
              <li key={i}>
                {e.label}: {e.value}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Validation summary</div>
        {validation.length === 0 && <div style={{ opacity: 0.7 }}>No active warnings or blocking errors.</div>}
        {(["blocking", "warning", "information"] as ValidationSeverity[]).map((severity) => {
          const results = validation.filter((r) => r.severity === severity);
          if (results.length === 0) return null;
          return (
            <div key={severity} style={{ marginBottom: 8 }}>
              <div style={{ color: SEVERITY_COLOUR[severity], fontWeight: 600 }}>
                {SEVERITY_LABELS[severity]} ({results.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {results.map((r, i) => (
                  <li key={i}>
                    <strong>{r.title}</strong>: {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
