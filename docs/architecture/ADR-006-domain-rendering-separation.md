# ADR-006: Strict separation of domain data and rendering objects

Status: Accepted
Date: 2026-09-15

## Context

Three.js scene objects (meshes, materials, buffer geometry) are a projection of
engineering data for display, not the data itself. If rendering state is ever treated
as authoritative (e.g. reading a foundation's dimensions back out of its mesh geometry,
or storing calculation results only as scene-graph transforms), the application loses
traceability and risks disagreement between "what is shown" and "what is true"
(principle #10).

## Decision

Enforce a one-directional data flow: domain layer (framework-free TypeScript) →
geometry layer (pure functions, framework-free) → rendering layer (R3F components that
construct Three.js objects from geometry-layer output). Rendering components read
domain/geometry state and produce Three.js objects; they never write engineering values
back into the domain store, and no domain value is ever computed by inspecting a
rendering object (a mesh, a `BufferGeometry`, a `Group` transform).

User interactions in the 3D view (drag, click-to-select, gizmo edits) dispatch
application-layer commands that mutate domain state; the resulting geometry is then
regenerated from that updated domain state, not from the manipulated Three.js object
directly.

## Alternatives considered

- **Let Three.js object transforms be the source of truth for position/orientation**
  (common in simple 3D editors) — rejected: this is exactly principle #10's prohibited
  pattern, and it also reintroduces the float32-precision problem (ADR-004) into the
  authoritative data path.
- **Bidirectional sync between domain store and scene graph** — rejected as unnecessary
  complexity: a one-directional flow with commands is simpler to reason about and test,
  and matches R3F's declarative model (ADR-002) naturally.

## Consequences

- Every interactive 3D manipulation needs an explicit command/mutation path back into
  domain state, even for things that feel like "just dragging a mesh" — this is a real
  implementation cost, accepted deliberately.
- Geometry regeneration must be efficient enough (memoised, versioned) that this
  one-directional flow doesn't cause visible lag on small parameter edits (ties into
  the "don't regenerate all scene geometry when one foundation parameter changes"
  performance requirement).

## Unresolved risks

- None material at MVP scope.
