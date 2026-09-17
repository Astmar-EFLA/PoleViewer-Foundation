import type { CSSProperties } from "react";
import { useRef } from "react";
import { useProjectStore } from "../state/projectStore";

const buttonStyle: CSSProperties = {
  fontSize: 11,
  padding: "4px 9px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
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

  const csvInputRef = useRef<HTMLInputElement>(null);
  const centrelineInputRef = useRef<HTMLInputElement>(null);

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
          imported pole model itself uses) -- reversed, this gives an exactly-180-degree-wrong orientation.
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
