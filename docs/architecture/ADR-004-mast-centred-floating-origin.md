# ADR-004: Mast-centred local floating origin

Status: Accepted
Date: 2026-09-15

## Context

Project coordinates (e.g. ISN93 Easting/Northing) are typically in the 300,000–700,000 m
range. Three.js `BufferGeometry` attributes are `Float32Array`. Float32 has ~24 mantissa
bits (~7.2 decimal digits of precision). At a magnitude of 500,000 m, one unit in the
last place (ULP) is approximately `500,000 * 2^-23 ≈ 0.06 m` — coarser than typical
foundation dimensions (on the order of 1–3 m) and far coarser than the sub-centimetre
precision engineering inspection requires. This is principle #8 ("never use large
projected coordinates directly as Three.js scene coordinates") made quantitative.

## Decision

Introduce a mast-centred local engineering coordinate frame (right-handed, Z up, X
transverse, Y longitudinal — see `docs/architecture/coordinate-strategy.md`) as an
intermediate stage between project coordinates and viewer/scene coordinates. All
Three.js geometry is built from coordinates already expressed relative to this local
origin, not from raw project coordinates.

A **separate** floating render origin (normally `(0,0,0)`, but tracked as its own value)
is kept distinct from the mast centre itself, so "where the mast is in project space"
and "where the renderer's numerical origin is" are never the same stored value — this
keeps the mast centre independently editable/movable without redefining the render
frame, and keeps project-space mast centre recoverable even if a future feature
re-centres the viewer origin for a different reason (e.g. viewing a neighbouring
structure).

## Alternatives considered

- **Use project coordinates directly in `BufferGeometry`** — rejected outright per the
  precision analysis above; this would make foundation-scale geometry visibly unstable
  or silently wrong at typical ISN93 magnitudes.
- **Double-precision Three.js geometry (patched/custom build)** — rejected: nonstandard,
  fragile against upstream Three.js updates, and unnecessary once a floating origin
  solves the problem with standard tooling.
- **Re-centre the origin to the camera (common in some large-world engines)** — rejected
  for MVP: adds complexity (continuous origin rebasing) that isn't justified at the
  scale of a single pole/tower site (~40 m extraction radius, occasionally larger for
  multi-span review); a fixed mast-centred origin per project is simpler and sufficient.

## Consequences

- After subtracting the local origin, typical magnitudes fall to the ~50–200 m range
  (default 40×40 m extraction plus surrounding context), giving float32 ULP
  ≈ `200 * 2^-23 ≈ 0.00002 m` — well within engineering tolerance.
- The domain layer must always retain full float64 project coordinates; only the final
  render-buffer conversion step is allowed to touch float32, and it must happen as late
  in the pipeline as possible (see ADR-006).
- Every coordinate-space-crossing function (project↔local↔viewer) must be a pure,
  independently tested function — this is enforced as an explicit round-trip test
  requirement (`docs/architecture/coordinate-strategy.md`), not left as a design
  intention.

## Unresolved risks

- None material at MVP scope. Revisit if a future requirement needs multiple
  structures spanning kilometres in one scene (would reintroduce large-magnitude local
  coordinates and require camera-relative rebasing).
