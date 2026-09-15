# ADR-003: Python + PDAL for point-cloud processing

Status: Accepted; dev-environment packaging resolved (2026-09-15, Phase 2), end-user packaging still open (see Phase 9 note below)
Date: 2026-09-15, updated 2026-09-15 (Phase 2)

## Context

LAS/LAZ files must be metadata-inspected, clipped, classification-filtered, decimated,
and reprojected without loading the whole file into the browser. This needs a mature,
correct point-cloud toolchain, not a hand-rolled parser.

## Decision

Use Python + PDAL as the authoritative point-cloud engine, exposed through a local
FastAPI service, with NumPy/SciPy for numerical work, Shapely for 2D polygon clipping
geometry, and Pydantic for request/response schemas.

## Alternatives considered

- **`laspy` (+ `lazrs`/`laszip` backends) in pure Python** — easier to `pip install` on
  Windows (no conda requirement), but its clipping/classification/CRS-reprojection
  support is materially less mature than PDAL's pipeline-stage model. Rejected as
  primary; could be revisited as a lighter-weight metadata-only fallback if PDAL
  packaging proves too heavy for some deployments.
- **Node.js point-cloud libraries** — rejected: would fragment the backend across two
  runtimes for no clear benefit, and the point-cloud tooling ecosystem is weaker than
  PDAL's in Node.
- **Do LAS/LAZ processing entirely client-side (WASM)** — rejected for MVP, see ADR-001.

## Consequences

- The backend has a real, non-trivial installation dependency (PDAL), which does not
  have official Windows pip wheels. The realistic installation routes are a
  conda-forge environment or a WSL2/Docker-hosted backend.
- This affects the Phase 9 packaging decision (Tauri/Electron/browser): a Tauri sidecar
  bundling a full conda-forge PDAL environment is materially harder than the
  browser-only or Docker-backed local-service model. That comparison is deferred to
  Phase 9 (per the prompt's own instruction not to default to Electron), but the risk
  is recorded here so it is not a Phase-9 surprise.

## Update (Phase 2, 2026-09-15): dev-environment packaging resolved

This machine had none of conda, WSL2, or Docker installed, and had no admin
rights available non-interactively (Node.js's own MSI installer failed for
exactly this reason during Phase 1). PDAL's Python bindings confirmed to have
no Windows wheel on PyPI (`pip index`/PyPI JSON for the `pdal` package shows
only a source `.tar.gz`, no `win_amd64` wheel) -- the risk recorded above was
accurate, not hypothetical.

**Resolution**: Miniforge's Windows `.exe` installer supports
`/InstallationType=JustMe /AddToPath=0 /S`, a fully silent, user-scope,
no-admin install (verified: no UAC prompt, installs to a user-writable
path). `conda create -c conda-forge python=3.11 pdal python-pdal gdal proj`
into a dedicated env then gives a working `import pdal` (verified: PDAL
2.10.2, exercised against real synthetic LAS fixtures via
`filters.crop`/`filters.expression`/`filters.decimation` -- see
`backend/tests/processing/` and `backend/README.md`). This is now the
documented, reproducible dev-setup path (`backend/environment.yml`), not
just a one-off workaround.

This resolves the **development-environment** packaging risk. It does
**not** resolve end-user packaging (a non-technical user cannot be expected
to run installer flags from a README) -- that comparison (Tauri sidecar vs.
Docker-backed service vs. bundled conda-forge env vs. something else) is
still explicitly deferred to Phase 9, per the original decision above.

## Other unresolved risks

- LAZ decompression of malformed/hostile files is a resource-exhaustion vector; the
  backend must apply file-size and point-count guards before full decompression
  (tracked as a Phase 2/Phase 9 security requirement -- not yet implemented; Phase 2
  so far only exercises small synthetic LAS files, not LAZ or adversarial input).
- The Phase 2 `/pointcloud/clip` endpoint is synchronous (no job queue,
  cancellation, or progress reporting), a deliberate scope reduction from the
  original processing-layer requirements list: the synthetic fixtures process
  in milliseconds, so there is nothing yet to cancel or report progress on.
  Revisit once real, larger LAS/LAZ files are in scope (Phase 9 hardening
  explicitly re-lists "processing can be cancelled or stopped safely").
