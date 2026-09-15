# ADR-003: Python + PDAL for point-cloud processing

Status: Accepted, with an explicitly unresolved packaging risk
Date: 2026-09-15

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

## Unresolved risks

- **PDAL on Windows packaging is unresolved.** Phase 2 will start by running the
  backend in a conda-forge environment (or WSL2) as the known-working path; the final
  end-user packaging story is explicitly deferred to Phase 9 and must be resolved
  before this ADR can be considered fully closed.
- LAZ decompression of malformed/hostile files is a resource-exhaustion vector; the
  backend must apply file-size and point-count guards before full decompression
  (tracked as a Phase 2/Phase 9 security requirement, not purely a packaging concern).
