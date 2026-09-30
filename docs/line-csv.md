# Line CSV (mast list)

The **Line** panel imports a whole line as a CSV: one row per mast, in line order (low to high). A mast selected from the list loads its own pole model, foundations and (with batch export) terrain. The same file drives the whole-line **batch export**: one interactive HTML viewer and one transverse-section DXF per mast.

**Template:** [`line-csv-template.csv`](line-csv-template.csv). The app's Line panel also offers it through **Download template**. It has every column and three example masts:
- one with every optional column filled in
- one without leg coordinates
- one with only the required columns

The coordinates are made-up examples; replace them. A test parses the template, so it always matches the app.

## Workspace folder

The backend only reads files inside **one workspace folder** (`POLE_VIEWER_WORKSPACE_ROOT`). Every `modelPath` and `pointCloudPath` in the CSV must be inside it, either relative to it or as an absolute path within it. If a path falls outside the folder, the backend rejects it: *"filePath resolves outside the approved workspace"*.

Pick the folder when starting the app:

- **`start-servers.bat`** (repo root) opens a small window before starting anything. It lists recently used folders, has **Browse...** to add another, and **Default** for `backend\workspace`. Choose one and click **Start**.
- **`start-backend.bat`** restarts **only the backend** with a newly chosen folder. Use it to switch between projects (e.g. a line on the O: drive and a local copy on C:) while the frontend keeps running; reload the page afterwards.
- Add `/nopick` to either script to skip the window and reuse the last choice.

The choice is kept in `workspace-root.local.txt`, and the recent list in `workspace-roots-recent.local.txt`. Both are in the repo root and gitignored.

## Columns

### Required

| Column | Meaning |
|---|---|
| `mastName` | Mast name. Batch-export files are named after it (`<mastName>.dxf`, `<mastName>-viewer.html`). |
| `easting`, `northing` | Mast centre, in the project CRS (e.g. ISN93 / EPSG:3057), m |
| `elevation` | Mast centre elevation, m a.s.l. |
| `modelPath` | The mast's `.pol` model, relative to the backend workspace folder (`POLE_VIEWER_WORKSPACE_ROOT`), e.g. `BS/10-BS-19_21.pol`. An absolute path inside that folder also works. |
| `bearingLayerDepthM` | Depth below terrain to the bearing layer, m |
| `groundwaterDepthM` | Depth below terrain to groundwater, m |

### Optional (leave blank)

| Column | Meaning |
|---|---|
| `legAEasting`, `legANorthing`, `legBEasting`, `legBNorthing` | Surveyed leg coordinates, for the mast's exact orientation instead of estimating it from the centreline. **A = LP, B = RP**, the convention the pole models use. Reversing them gives an orientation exactly 180° wrong. Give all four or none. |
| `pointCloudPath` | This mast's own `.las`/`.laz`, relative to the workspace folder. Without it, the point cloud currently open in the app is used. |
| `foundationTypeId` | Leg foundation type, an id from the foundation library, e.g. `B170-155x155` or `C120-160x160`. Without it, the default type is used. Guy-anchor foundations are not affected. |

## Format
- **Comma- or semicolon-separated.** The delimiter is detected from the header row.
- A **semicolon** file, which Excel writes under Icelandic (and most European) regional settings, may use a **decimal comma**: `537012,4`. A dot decimal is also accepted.
- A comma file must use a dot decimal.
- Thousands separators (`537.012,4`) are not supported and are reported as an invalid number.
- Double-quoted fields may contain the delimiter.
- A UTF-8 BOM (Excel's "CSV UTF-8") is fine.
- Column order does not matter. Columns are matched by header name, which is case-sensitive.
