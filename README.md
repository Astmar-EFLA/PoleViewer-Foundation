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

See [docs/architecture](docs/architecture) for the phase plan and
[docs/decisions](docs/decisions) for Architecture Decision Records.

No representative project files (pole JSON, GLB, LAS/LAZ, foundation tables) have been
supplied yet. All fixtures under `fixtures/synthetic` are synthetic and clearly labelled
as such — format support for any real-world source system remains unverified until real
files are inspected (see ADR-003 and the Phase 0 notes in docs/architecture).

## Running it locally

1. Backend: see [backend/README.md](backend/README.md) (`conda env create -f backend/environment.yml`,
   then `uvicorn app.main:app --port 8100`).
2. Frontend: `cd frontend && npm install && npm run dev`, then open the printed
   `localhost` URL. The demo project loads a synthetic terrain immediately (no backend
   required); the "Regenerate from point cloud" button in the viewer calls the backend
   for a real PDAL-clipped terrain if it's running.

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
