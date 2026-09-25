import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { EngineeringSummary, SummaryBucket } from "../services/engineeringSummary";
import { buildEngineeringSummary } from "../services/engineeringSummary";
import type { ExcavationMaterialQuantities } from "../services/excavationMaterialQuantities";
import { computeExcavationMaterialQuantities } from "../services/excavationMaterialQuantities";
import type { FillMaterialQuantities } from "../services/fillMaterialQuantities";
import { computeFillMaterialQuantities } from "../services/fillMaterialQuantities";
import type { FoundationMaterialQuantities } from "../services/foundationMaterialQuantities";
import { computeFoundationMaterialQuantities } from "../services/foundationMaterialQuantities";
import type { PerFoundationVolumeTable } from "../services/perFoundationVolumeTable";
import { buildPerFoundationVolumeTable } from "../services/perFoundationVolumeTable";
import { validateUpliftFillInstance } from "../validation/fillValidation";
import { downloadText } from "../services/browserDownload";
import { exportProjectAsStandaloneHtml } from "../services/exportProjectHtml";
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

const GROSS_VOLUME_NOTE = "Excavation and fill volumes are gross -- foundation concrete is not deducted from them.";

function formatVolume(volumeM3: number | null): string {
  return volumeM3 === null ? "-" : volumeM3.toFixed(2);
}

function formatPerFoundationVolumesAsText(
  table: PerFoundationVolumeTable,
  concrete: FoundationMaterialQuantities
): string[] {
  const lines: string[] = ["## Volumes per foundation (m3)"];
  if (table.rows.length === 0) {
    lines.push("Not calculated -- no foundations.");
    lines.push("");
    return lines;
  }
  lines.push("Foundation | Concrete | Excavation | Fill | Uplift fill");
  for (const r of table.rows) {
    lines.push(
      `${r.label} | ${formatVolume(r.concreteM3)} | ${formatVolume(r.excavationM3)} | ${formatVolume(r.fillM3)} | ${formatVolume(r.upliftFillM3)}`
    );
  }
  const t = table.totals;
  lines.push(
    `Total | ${formatVolume(t.concreteM3)} | ${formatVolume(t.excavationM3)} | ${formatVolume(t.fillM3)} | ${formatVolume(t.upliftFillM3)}`
  );
  lines.push("(- = not calculated, or no instance of that kind for this foundation)");
  lines.push(`(${GROSS_VOLUME_NOTE})`);
  for (const l of concrete.limitations) lines.push(`(${l})`);
  lines.push("");
  return lines;
}

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

function formatFillQuantitiesAsText(quantities: FillMaterialQuantities, title: string): string[] {
  const lines: string[] = [`## Material quantities (${title})`];
  if (quantities.status === "no-terrain-surface") {
    lines.push("Not calculated -- no terrain surface.");
  } else if (quantities.status === "no-fills") {
    lines.push("Not calculated -- no fills.");
  } else {
    lines.push(`Total fill: ${quantities.totalVolumeM3?.toFixed(1) ?? "-"} m3`);
    if (quantities.fillsBlocked > 0) {
      lines.push(
        `${quantities.fillsBlocked} of ${quantities.fillsCalculated + quantities.fillsBlocked} fill(s) could not be calculated and are excluded from this total.`
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
  perFoundationVolumes: PerFoundationVolumeTable,
  foundationQuantities: FoundationMaterialQuantities,
  materialQuantities: ExcavationMaterialQuantities,
  fillQuantities: FillMaterialQuantities,
  upliftFillQuantities: FillMaterialQuantities,
  nowIso: string
): string {
  const lines: string[] = [];
  lines.push(`Engineering parameter and validation summary -- generated ${nowIso}`);
  lines.push("This is a design-support summary, not an approved design or certified quantity.");
  lines.push("");

  lines.push(...formatPerFoundationVolumesAsText(perFoundationVolumes, foundationQuantities));
  lines.push(...formatMaterialQuantitiesAsText(materialQuantities));
  lines.push(...formatFillQuantitiesAsText(fillQuantities, "fill"));
  lines.push(...formatFillQuantitiesAsText(upliftFillQuantities, "uplift fill"));

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

function FillQuantitiesSection({ title, quantities }: { title: string; quantities: FillMaterialQuantities }) {
  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Material quantities ({title})</div>
      {quantities.status === "no-terrain-surface" && (
        <div style={{ opacity: 0.7, marginBottom: 16 }}>Not calculated -- no terrain surface.</div>
      )}
      {quantities.status === "no-fills" && (
        <div style={{ opacity: 0.7, marginBottom: 16 }}>Not calculated -- no fills.</div>
      )}
      {quantities.status === "calculated" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 4 }}>
            Total {title}: <strong>{quantities.totalVolumeM3?.toFixed(1) ?? "-"} m³</strong>
          </div>
          {quantities.fillsBlocked > 0 && (
            <div style={{ color: "#c98a12", marginTop: 4 }}>
              {quantities.fillsBlocked} of {quantities.fillsCalculated + quantities.fillsBlocked} fill(s) could not be
              calculated and are excluded from this total.
            </div>
          )}
          {quantities.limitations.map((l, i) => (
            <div key={i} style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const cellStyle: CSSProperties = { padding: "2px 8px", textAlign: "right", borderBottom: "1px solid #eee" };
const labelCellStyle: CSSProperties = { ...cellStyle, textAlign: "left" };

function PerFoundationVolumesSection({
  table,
  concrete,
}: {
  table: PerFoundationVolumeTable;
  concrete: FoundationMaterialQuantities;
}) {
  const t = table.totals;
  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Volumes per foundation</div>
      {table.rows.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 16 }}>Not calculated -- no foundations.</div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <table style={{ borderCollapse: "collapse", marginBottom: 4 }}>
            <thead>
              <tr>
                <th style={labelCellStyle}>Foundation</th>
                <th style={cellStyle}>Concrete (m³)</th>
                <th style={cellStyle}>Excavation (m³)</th>
                <th style={cellStyle}>Fill (m³)</th>
                <th style={cellStyle}>Uplift fill (m³)</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.foundationInstanceId}>
                  <td style={labelCellStyle}>{r.label}</td>
                  <td style={cellStyle}>{formatVolume(r.concreteM3)}</td>
                  <td style={cellStyle}>{formatVolume(r.excavationM3)}</td>
                  <td style={cellStyle}>{formatVolume(r.fillM3)}</td>
                  <td style={cellStyle}>{formatVolume(r.upliftFillM3)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td style={labelCellStyle}>Total</td>
                <td style={cellStyle}>{formatVolume(t.concreteM3)}</td>
                <td style={cellStyle}>{formatVolume(t.excavationM3)}</td>
                <td style={cellStyle}>{formatVolume(t.fillM3)}</td>
                <td style={cellStyle}>{formatVolume(t.upliftFillM3)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
            "-" = not calculated, or no instance of that kind for this foundation.
          </div>
          <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>{GROSS_VOLUME_NOTE}</div>
          {concrete.limitations.map((l, i) => (
            <div key={i} style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </>
  );
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
  const [htmlExportStatus, setHtmlExportStatus] = useState<"idle" | "exporting" | "error">("idle");
  const [htmlExportError, setHtmlExportError] = useState<string | null>(null);

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
  const fillQuantities = useMemo(() => (project ? computeFillMaterialQuantities(project) : null), [project]);
  const upliftFillQuantities = useMemo(
    () =>
      project
        ? computeFillMaterialQuantities(project, project.upliftFillInstances, validateUpliftFillInstance)
        : null,
    [project]
  );

  const foundationQuantities = useMemo(
    () => (project ? computeFoundationMaterialQuantities(project) : null),
    [project]
  );
  const perFoundationVolumes = useMemo(
    () =>
      project && foundationQuantities && materialQuantities && fillQuantities && upliftFillQuantities
        ? buildPerFoundationVolumeTable(
            project,
            foundationQuantities,
            materialQuantities,
            fillQuantities,
            upliftFillQuantities
          )
        : null,
    [project, foundationQuantities, materialQuantities, fillQuantities, upliftFillQuantities]
  );

  if (
    !reportOpen ||
    !project ||
    !summary ||
    !materialQuantities ||
    !fillQuantities ||
    !upliftFillQuantities ||
    !foundationQuantities ||
    !perFoundationVolumes
  )
    return null;

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
                JSON.stringify(
                  {
                    generatedAt: nowIso,
                    summary,
                    perFoundationVolumes,
                    foundationQuantities,
                    materialQuantities,
                    fillQuantities,
                    upliftFillQuantities,
                    validation,
                  },
                  null,
                  2
                ),
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
                formatSummaryAsText(
                  summary,
                  validation,
                  perFoundationVolumes,
                  foundationQuantities,
                  materialQuantities,
                  fillQuantities,
                  upliftFillQuantities,
                  nowIso
                ),
                `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.txt`,
                "text/plain"
              )
            }
          >
            Export text
          </button>
          <button
            style={buttonStyle}
            disabled={htmlExportStatus === "exporting"}
            onClick={async () => {
              setHtmlExportStatus("exporting");
              setHtmlExportError(null);
              try {
                await exportProjectAsStandaloneHtml(project);
                setHtmlExportStatus("idle");
              } catch (error) {
                setHtmlExportStatus("error");
                setHtmlExportError((error as Error).message);
              }
            }}
          >
            {htmlExportStatus === "exporting" ? "Exporting..." : "Export interactive HTML"}
          </button>
        </div>
        {htmlExportStatus === "error" && (
          <div style={{ color: "#c02020", marginTop: -8, marginBottom: 16 }}>{htmlExportError}</div>
        )}

        <PerFoundationVolumesSection table={perFoundationVolumes} concrete={foundationQuantities} />

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

        <FillQuantitiesSection title="fill" quantities={fillQuantities} />
        <FillQuantitiesSection title="uplift fill" quantities={upliftFillQuantities} />

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
