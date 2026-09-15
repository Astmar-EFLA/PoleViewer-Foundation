# Known limitations

This is a design-support and design-review tool. It does not perform
structural or geotechnical design, and visualised foundations, ground
layers, excavation geometry and quantities are not an approved design or a
certified construction quantity (see the README). Beyond that overall
framing, the following specific limitations are known and unresolved as of
Phase 9:

## Data and formats

- **No real project files have been supplied or tested yet.** Every fixture
  under `fixtures/synthetic/` is synthetic and labelled as such. Format
  support for a real-world pole-model JSON, LAS/LAZ file, or GLB visual
  mesh remains unverified until real representative files are inspected
  (see spec section 29 / the README).
- **No pole/tower visual mesh is loaded.** Only the pole model's declared
  anchors render (as markers) -- the structural members themselves (legs,
  bracing) are not visualised, since no GLB/GLTF loading path exists yet.
- **The foundation library has two types**: rectangular pad-with-pedestal
  and stepped-rectangular. Pile foundations, spread footings with a
  different geometry, and other real-world types are not modelled.

## Rendering and inspection

- **Three.js transparency sorting** makes overlapping translucent layers
  (multiple geotech boundaries, groundwater, excavation) visually muddy in
  the 3D view at higher opacities. This is a known, documented limitation
  of order-independent transparency in Three.js, not something the 3D
  renderer fixes -- the vertical sections (Phase 7) are the intended way to
  inspect overlapping layers unambiguously, since a flat 2D diagram has no
  transparency-ordering problem.
- **Fixed camera views (top/front/side/iso/"fit all") use fixed offsets**,
  not a computed bounding-box fit. A very large or very small project may
  need manual orbit/zoom after selecting a preset. "Fit selection" is not
  implemented.
- **Measurement point-picking only works on the terrain surface.** A point
  cannot yet be picked directly on a foundation, excavation, or
  geotechnical boundary mesh.

## Project files and assets

- **A project file and its point-cloud asset are not guaranteed to travel
  together.** ADR-008 originally specified a project as one workspace
  folder (`project.json` + `assets/`); Phase 8 implemented asset
  missing/hash-mismatch detection (`POST /workspace/file-status`) but
  `project.json` itself is saved via a plain browser download, independent
  of the backend's `POLE_VIEWER_WORKSPACE_ROOT`. See ADR-008's "Phase 8
  resolution" note.
- **The schema migration framework has never been exercised.** There has
  been exactly one project schema version to date, so `migrateProjectJson`
  is presently an identity pass plus a rejection of anything else. The
  mechanism exists; a real migration path has not been proven.

## Backend and processing

- **No authentication or authorization.** Acceptable for a strictly
  local-only tool (ADR-001) reachable only via loopback, but this backend
  must never be exposed to a network or run multi-tenant without adding
  that layer first.
- **Single-request-at-a-time processing.** The backend runs each PDAL
  pipeline synchronously on the request thread, with no queue or worker
  pool. Phase 9 added size and result-count guards (`POLE_VIEWER_MAX_FILE_SIZE_MB`,
  `POLE_VIEWER_MAX_RETURNED_POINTS`) to bound the worst case of a single
  request, but does not add concurrency control -- several large requests
  in flight at once can still degrade responsiveness for everyone.
- **Cancellation is client-side only.** The frontend can abort waiting on a
  clip/inspect/file-status request (Phase 9), but PDAL itself has no
  cooperative mid-pipeline cancellation; the backend's own CPU work for an
  already-dispatched request may continue briefly after the frontend gives
  up on it.

## Testing and packaging

- **No automated end-to-end/browser test suite.** Verification has relied
  on unit/integration tests (Vitest, pytest) plus live manual verification
  in the browser each phase, not an automated regression suite (e.g.
  Playwright) that would catch a UI regression without a human looking.
- **No single-executable or desktop-app packaging.** See
  ADR-011: the backend can serve a production frontend build as one
  process, but a PDAL/conda environment install is still required to run
  it. A true single-executable or Electron package is a deliberately
  deferred next step, not attempted in this session.
