# Pole/Tower Engineering Viewer

Local-first 3D engineering viewer for transmission-line poles and towers: terrain,
foundations, excavation geometry, groundwater and geotechnical layers.

This is a design-support and design-review tool. It does not perform structural or
geotechnical design, and visualised foundations, ground layers, excavation geometry
and quantities are not an approved design or a certified construction quantity.

## Status

- Phase 1 (coordinate-safe vertical slice) — done: coordinate chain, pole anchors,
  per-leg foundations, synthetic terrain, save/reopen, R3F viewer.
- Phase 2 (FastAPI + PDAL point-cloud backend) — done: metadata inspection, rectangular
  clip (rotatable/offsettable), classification selection, decimation, CRS validation.
- Phase 3 (terrain surface from the real point cloud) — done: the frontend's TIN
  generator now runs on real backend-clipped LAS points, not just synthetic fixtures;
  points/surface/wireframe display modes.
- Phase 4 (foundation library and per-leg editing) — done: parametric rectangular
  pad-pedestal and stepped-rectangular foundation types, independent per-leg base
  elevation, copy-to-other-legs.
- Phase 5 (geotechnical layers and groundwater) — done: terrain-relative and
  absolute-elevation boundary surfaces, groundwater table, inversion/intersection
  validation.
- Phase 6 (excavation geometry) — done: working-space offset, H:V side slopes,
  terrain-intersection solving, approximate volume with explicit blocking/truncation
  status.
- Phase 7 (sections and measurements) — done: longitudinal/transverse/leg/custom
  vertical sections rendered as flat 2D diagrams derived from the same geometry as
  the 3D view, a horizontal clipping plane, fixed camera views, and point/distance/
  slope/clearance measurement tools with explicit staleness tracking after geometry
  changes.
- Phase 8 (project persistence and reporting) — done: save/reopen a `project.json`
  file (schema-validated, with a migration-framework scaffold gating unsupported
  schema versions); a backend asset-status check (SHA-256, missing/modified
  detection per ADR-008 — see its "Phase 8 resolution" note for what is and isn't
  covered); an engineering parameter summary separated into imported/user-entered/
  assumed/calculated; a validation summary aggregating every existing validator; and
  screenshot + section-image export.
- Phase 9 (hardening and packaging) — done: backend processing guards (file-size and
  returned-point-count limits, extension validation, all fail visibly rather than
  hanging or erroring obscurely), a generic 500 handler that never leaks a traceback,
  cancellable point-cloud requests (AbortController end to end), React error
  boundaries around the 3D view and every panel, GPU geometry disposal, lightweight
  performance instrumentation (TIN build time, section computation time), a shared
  calculation-version constant, and an optional single-process packaged run mode
  (see [ADR-011](docs/architecture/ADR-011-packaging-strategy.md)). Known gaps are
  tracked in [docs/architecture/known-limitations.md](docs/architecture/known-limitations.md).
- PLS-POLE (.pol) import — done: `POST /polemodel/import` parses a real PLS-POLE
  geometry export into this app's `PoleModel`, verified against a real 2-pole guyed
  H-frame export (not committed -- see the synthetic fixture used for automated
  tests instead). Leg-base anchors are identified from a node-labelling heuristic
  (`<name>:g`); mast centre is always calculated from those anchors, never read from
  a label (see [ADR-012](docs/architecture/ADR-012-pls-pole-import.md) for why, and
  its limitations). The rest of the imported structure renders as coloured line
  geometry (steel/guys/insulators) via a new "Import pole model" control in the
  Project panel -- rendering-only, never consulted by any calculation (ADR-005/006).

See [docs/architecture](docs/architecture) for the phase plan and
[docs/decisions](docs/decisions) for Architecture Decision Records.

No representative project files (pole JSON, GLB, LAS/LAZ, foundation tables) have been
supplied yet. All fixtures under `fixtures/synthetic` are synthetic and clearly labelled
as such — format support for any real-world source system remains unverified until real
files are inspected (see ADR-003 and the Phase 0 notes in docs/architecture).

## Running it locally

### Development (two processes, hot reload)

1. Backend: see [backend/README.md](backend/README.md) (`conda env create -f backend/environment.yml`,
   then `uvicorn app.main:app --port 8100`).
2. Frontend: `cd frontend && npm install && npm run dev`, then open the printed
   `localhost` URL. The demo project loads a synthetic terrain immediately (no backend
   required); the "Regenerate from point cloud" button in the viewer calls the backend
   for a real PDAL-clipped terrain if it's running.

### Packaged (one process) — see ADR-011

1. `cd frontend && npm install && npm run build` (produces `frontend/dist/`).
2. Run the backend as above (same conda environment). It detects `frontend/dist/`
   automatically and serves it at `/`, alongside the API — no separate frontend
   process, no CORS involved.
3. Open `http://127.0.0.1:8100/`.

Backend processing limits (`POST /pointcloud/inspect`, `/clip`) are configurable via
`POLE_VIEWER_MAX_FILE_SIZE_MB` (default 500) and `POLE_VIEWER_MAX_RETURNED_POINTS`
(default 2,000,000) — see [backend/README.md](backend/README.md).

## Repository layout

- `frontend/` — React + TypeScript + React Three Fiber viewer. `src/domain` and
  `src/geometry` are framework-free and independently testable; `src/rendering` is the
  only place Three.js objects and float32 buffers are constructed.
- `backend/` — Python + FastAPI + PDAL local processing service for LAS/LAZ handling.
  Runs only against an approved local workspace; never uploads source files externally.
- `shared/` — schemas and examples shared between frontend and backend.
- `fixtures/` — synthetic test fixtures (`synthetic/`) and their expected results.
- `docs/architecture` — ADRs and phase/verification notes.

## Coordinate convention (authoritative — see ADR-004 and docs/architecture/coordinate-strategy.md)

- Project coordinates: Easting, Northing, Elevation, CRS explicit and required (no default CRS).
- Local engineering coordinates: X = transverse, Y = longitudinal, Z = up, right-handed.
- Angles stored internally in radians; bearings clockwise from project/grid north.
- A mast-centred local floating origin is used for all Three.js scene geometry; large
  projected coordinates (e.g. ISN93-scale ~500,000 E / 500,000 N) are never used directly
  as scene coordinates. See `docs/architecture/coordinate-strategy.md` for the precision
  analysis behind this rule.

## Development environment

- Frontend: Node.js LTS, npm, TypeScript strict mode, Vitest.
- Backend: Python 3.11+, FastAPI, PDAL (packaging via conda-forge recommended on Windows —
  see ADR-003 for the unresolved packaging risk).

Setup instructions will be added once the Phase 1 vertical slice's `package.json` and
`pyproject.toml` are in place.
