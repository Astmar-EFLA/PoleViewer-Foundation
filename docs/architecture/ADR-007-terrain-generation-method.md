# ADR-007: TIN (Delaunay) terrain generation for MVP

Status: Accepted for MVP, pending real-data review
Date: 2026-09-15

## Context

Terrain must be generated from classified ground points such that source points remain
inspectable and distinguishable from interpolated surface (principle #5, spec §9). No
representative LAS/LAZ file has been inspected yet (Phase 0 is currently unfulfilled),
so point density and distribution characteristics are unknown.

## Decision

Use a 2D (XY) Delaunay triangulation (`scipy.spatial.Delaunay`, i.e. Qhull) of the
filtered ground points as the terrain surface for the MVP, with a configurable maximum
edge length beyond which triangles are rejected/flagged rather than silently rendered.

## Alternatives considered

- **Gridded DEM (raster interpolation, e.g. IDW or kriging onto a regular grid)** —
  rejected for MVP: any grid-cell resampling immediately blurs the "is this value
  measured or interpolated" distinction required by spec §9, since a DEM cell value is
  never exactly a source point's elevation unless the grid happens to align. TIN
  vertices, by contrast, are exactly the source points. Revisit if real LAS density is
  so high or so irregular that TIN triangle counts become a practical performance
  problem.
- **Natural-neighbour or spline-based surfaces** — rejected for MVP as unnecessary
  complexity beyond what the design-review use case needs (principle #18 — prefer
  simple correct geometry over unverified sophistication).

## Consequences

- Terrain quality is directly limited by ground-point density and classification
  quality; sparse/hole areas must be detected and flagged (spec §9), not silently
  bridged by triangulation.
- Determinism: Qhull's tie-breaking for duplicate/near-duplicate/collinear points can be
  platform- or version-sensitive. Terrain tests must pre-filter duplicate points and pin
  input point order, and treat triangulation determinism as an explicitly tested
  property, not an assumption.

## Unresolved risks

- Whether TIN remains adequate once real LAS files are inspected (Phase 0) is
  unresolved; this ADR should be revisited with real point-density data before Phase 3
  is considered closed.
