# ADR-001: Local-first architecture

Status: Accepted
Date: 2026-09-15

## Context

The application processes engineering source data (pole/tower models, point clouds,
foundation and geotechnical parameters) that is often confidential project data. It must
support offline/site use and must not depend on a cloud service to function.

## Decision

The application runs entirely on the user's machine: a local frontend, a local FastAPI
backend for LAS/LAZ processing, and a local project workspace on disk. No core engineering
file (pole model, point cloud, project JSON) is uploaded to an external service as part of
normal operation.

## Alternatives considered

- **Cloud-hosted processing service** — rejected: introduces a network dependency for
  core workflows, and raises data-handling questions for client-confidential survey and
  design data that a local-first tool avoids by construction.
- **Fully client-side (no backend at all)**, doing LAS/LAZ parsing in the browser/WASM —
  rejected for MVP: PDAL's clipping/classification/CRS-reprojection pipeline is
  significantly more mature than the available WASM point-cloud libraries; revisit only
  if a specific WASM LAS toolchain is evaluated against real files.

## Consequences

- Requires a local Python + PDAL environment on the user's machine (see ADR-003), which
  is a real installation/packaging burden, particularly on Windows.
- Simplifies the security posture: no external upload path to reason about for the
  "never upload core files" requirement.
- Multi-user collaboration (shared projects, concurrent editing) is explicitly out of
  scope for the MVP as a consequence of this decision.

## Unresolved risks

- Packaging a local Python/PDAL backend for non-technical end users (vs. developers who
  can set up a conda environment) is unresolved — see ADR-003.
