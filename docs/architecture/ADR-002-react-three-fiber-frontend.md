# ADR-002: React + TypeScript + React Three Fiber frontend

Status: Accepted
Date: 2026-09-15

## Context

The viewer needs an interactive 3D scene tightly coupled to structured engineering data
(layer tree, property panels, sections, validation), not a standalone 3D demo. It also
needs strict typing for a domain with many similarly-shaped but distinct value types
(project vs local vs viewer coordinates, depth vs elevation, etc.), where a unit or
frame mix-up is a correctness bug, not a style issue.

## Decision

React + TypeScript (strict mode) for the application shell and UI, React Three Fiber
(R3F) as the Three.js binding for the 3D viewport, Drei used selectively (only where it
removes real boilerplate, e.g. camera controls), Zustand for application state, Zod for
schema validation of imported JSON.

## Alternatives considered

- **Raw Three.js + a UI framework bolted on** — rejected: loses R3F's declarative
  scene-graph-as-React-tree model, which materially helps keep rendering objects
  derived from domain state (ADR-006) rather than imperatively mutated ad hoc.
- **Babylon.js** — capable engine, but weaker TypeScript-first R3F-style React
  integration and smaller ecosystem overlap with three-mesh-bvh-based tooling this
  project expects to need for clipping/raycasting performance.
- **Redux / React Context for state** — rejected in favour of Zustand: Zustand's
  slice model is a better fit for keeping rendering state and domain state as clearly
  separate, independently-subscribed stores (ADR-006), without Redux's action/reducer
  ceremony for what is largely direct state mutation with selectors.

## Consequences

- Domain and geometry code (ADR-006) must be written as plain TypeScript with no React
  or Three.js imports, so it stays independently unit-testable and reusable if the
  rendering layer changes.
- Float32 precision limits of Three.js `BufferGeometry` become a first-class constraint
  on where in the pipeline coordinate conversion is allowed to happen (see
  `docs/architecture/coordinate-strategy.md` and ADR-004).

## Unresolved risks

- Drei version churn / breaking changes across R3F major versions is a maintenance
  risk to track, not a blocker.
