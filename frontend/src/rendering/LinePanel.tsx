import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { BatchExportMastStatus } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

const buttonStyle: CSSProperties = {
  fontSize: 11,
  padding: "4px 9px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};

const BATCH_STATUS_COLOUR: Record<BatchExportMastStatus, string> = {
  pending: "#888",
  selecting: "#3070e0",
  "loading-terrain": "#3070e0",
  exporting: "#3070e0",
  success: "#2a8f3c",
  error: "#c02020",
  skipped: "#c98a12",
};

const BATCH_STATUS_LABEL: Record<BatchExportMastStatus, string> = {
  pending: "Pending",
  selecting: "Selecting mast...",
  "loading-terrain": "Regenerating terrain...",
  exporting: "Exporting...",
  success: "Exported",
  error: "Failed",
  skipped: "Skipped",
};

/**
 * A whole transmission line: a CSV mast list (name/position/model path/
 * bearing-layer depth/groundwater depth per row, row order = line order)
 * plus an optional centreline shapefile for a more accurate line bearing
 * at each mast than a straight line to the next one would give. Picking a
 * mast rebuilds the ordinary single-mast project around that row -- see
 * state/projectStore.ts's selectLineMast. Session-only: none of this is
 * saved with the project (see the plan this was built from).
 */
export function LinePanel() {
  const lineImport = useProjectStore((s) => s.lineImport);
  const importLineCsv = useProjectStore((s) => s.importLineCsv);
  const importLineCentreline = useProjectStore((s) => s.importLineCentreline);
  const selectLineMast = useProjectStore((s) => s.selectLineMast);
  const batchExport = useProjectStore((s) => s.batchExport);
  const runBatchExport = useProjectStore((s) => s.runBatchExport);
  const resetBatchExport = useProjectStore((s) => s.resetBatchExport);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const centrelineInputRef = useRef<HTMLInputElement>(null);
  const [selectedMasts, setSelectedMasts] = useState<Set<number>>(new Set());

  // A freshly-(re)loaded CSV starts with nothing checked -- deliberate
  // per-tower selection, not an opt-out "everything" default, since
  // point-cloud survey coverage genuinely differs per tower.
  useEffect(() => {
    setSelectedMasts(new Set());
  }, [lineImport.masts]);

  function toggleMast(index: number) {
    setSelectedMasts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleCsvChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await importLineCsv(file);
  }

  async function handleCentrelineChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await importLineCentreline(file);
  }

  const selectedMast =
    lineImport.selectedMastIndex !== null ? lineImport.masts[lineImport.selectedMastIndex] : undefined;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Mast list (CSV)</div>
        <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
          One row per mast, in line order (low to high): mastName, easting, northing, elevation, modelPath,
          bearingLayerDepthM, groundwaterDepthM. Optional: legAEasting, legANorthing, legBEasting, legBNorthing --
          for exact orientation instead of the centreline/mast-to-mast estimate (leave all four blank to skip; a
          partial set is rejected). Order matters: legA must be "LP", legB must be "RP" (the same convention the
          imported pole model itself uses) -- reversed, this gives an exactly-180-degree-wrong orientation. Also
          optional: pointCloudPath -- this mast's own point-cloud (.las/.laz) file, for towers surveyed as
          separate per-tower files rather than one file for the whole line (used by batch export below; a mast
          without it falls back to whichever point cloud is currently registered on the project). Also optional:
          foundationTypeId -- overrides this mast's leg foundation type (e.g. "stepped-rectangular-v1"), matching
          an id in the foundation library; a mast without it uses the app's default leg foundation type.
        </div>
        <button type="button" style={buttonStyle} onClick={() => csvInputRef.current?.click()}>
          Choose line CSV...
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => void handleCsvChosen(e)}
        />
        {lineImport.csvStatus === "error" && (
          <div style={{ color: "#c02020", marginTop: 4 }}>{lineImport.csvErrorMessage}</div>
        )}
        {lineImport.csvStatus === "success" && (
          <div style={{ color: "#2a8f3c", marginTop: 4 }}>{lineImport.masts.length} mast(s) loaded.</div>
        )}
      </div>

      {lineImport.masts.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ opacity: 0.8, marginBottom: 2 }}>Mast</div>
          <select
            value={lineImport.selectedMastIndex ?? ""}
            disabled={lineImport.selectMastStatus === "loading"}
            onChange={(e) => void selectLineMast(Number(e.target.value))}
            style={{ width: "100%" }}
          >
            <option value="" disabled>
              -- choose a mast --
            </option>
            {lineImport.masts.map((m, i) => (
              <option key={`${m.mastName}-${i}`} value={i}>
                {i + 1}. {m.mastName}
              </option>
            ))}
          </select>
          {lineImport.selectMastStatus === "loading" && (
            <div style={{ opacity: 0.6, marginTop: 4 }}>Loading mast...</div>
          )}
          {lineImport.selectMastStatus === "error" && (
            <div style={{ color: "#c02020", marginTop: 4 }}>{lineImport.selectMastErrorMessage}</div>
          )}
          {selectedMast && lineImport.selectMastStatus !== "loading" && (
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              Mast {lineImport.selectedMastIndex! + 1} of {lineImport.masts.length}: {selectedMast.mastName}
            </div>
          )}
        </div>
      )}

      {lineImport.masts.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #ddd" }}>
          <div style={{ opacity: 0.8, marginBottom: 2 }}>Batch export (interactive HTML)</div>
          <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
            Choose which masts to export -- each one is selected, its terrain regenerated from its own point
            cloud (or the shared one if the row has none), then exported, in order, as an interactive HTML viewer
            (&lt;mast&gt;-viewer.html) plus its transverse section as a DXF drawing (&lt;mast&gt;.dxf). Point-cloud coverage often
            differs per tower, so nothing is selected by default.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setSelectedMasts(new Set(lineImport.masts.map((_, i) => i)))}
            >
              Select all
            </button>
            <button type="button" style={buttonStyle} onClick={() => setSelectedMasts(new Set())}>
              Select none
            </button>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #eee", borderRadius: 4, padding: 4, marginBottom: 6 }}>
            {lineImport.masts.map((m, i) => {
              const result = batchExport.results.find((r) => r.mastIndex === i);
              return (
                <label key={`${m.mastName}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <input
                    type="checkbox"
                    checked={selectedMasts.has(i)}
                    disabled={batchExport.status === "running"}
                    onChange={() => toggleMast(i)}
                  />
                  <span style={{ flex: 1 }}>
                    {i + 1}. {m.mastName}
                    {!m.pointCloudPath && <span style={{ opacity: 0.5 }}> (shared point cloud)</span>}
                  </span>
                  {result && (
                    <span style={{ color: BATCH_STATUS_COLOUR[result.status], fontSize: 10 }}>
                      {BATCH_STATUS_LABEL[result.status]}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={buttonStyle}
              disabled={selectedMasts.size === 0 || batchExport.status === "running"}
              onClick={() => void runBatchExport([...selectedMasts].sort((a, b) => a - b))}
            >
              {batchExport.status === "running" ? "Exporting..." : `Export selected (${selectedMasts.size})`}
            </button>
            {batchExport.status === "done" && (
              <button type="button" style={buttonStyle} onClick={resetBatchExport}>
                Clear results
              </button>
            )}
          </div>
          {batchExport.status === "done" && (
            <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75 }}>
              {batchExport.results.filter((r) => r.status === "success").length} succeeded,{" "}
              {batchExport.results.filter((r) => r.status === "error").length} failed,{" "}
              {batchExport.results.filter((r) => r.status === "skipped").length} skipped.
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{ opacity: 0.8, marginBottom: 2 }}>Centreline (shapefile, .zip)</div>
        <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
          Optional -- gives a more accurate line bearing at each mast than a straight line to the next one
          (matters most at angle towers). Without it, bearing falls back to the straight mast-to-mast direction.
        </div>
        <button
          type="button"
          style={buttonStyle}
          disabled={lineImport.centrelineStatus === "loading"}
          onClick={() => centrelineInputRef.current?.click()}
        >
          {lineImport.centrelineStatus === "loading" ? "Uploading..." : "Choose centreline shapefile (.zip)..."}
        </button>
        <input
          ref={centrelineInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={(e) => void handleCentrelineChosen(e)}
        />
        {lineImport.centrelineStatus === "error" && (
          <div style={{ color: "#c02020", marginTop: 4 }}>{lineImport.centrelineErrorMessage}</div>
        )}
        {lineImport.centrelineStatus === "success" && (
          <div style={{ color: "#2a8f3c", marginTop: 4 }}>{lineImport.centreline?.length ?? 0} vertex/vertices loaded.</div>
        )}
        {lineImport.centrelineWarnings.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#c98a12" }}>
            {lineImport.centrelineWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
