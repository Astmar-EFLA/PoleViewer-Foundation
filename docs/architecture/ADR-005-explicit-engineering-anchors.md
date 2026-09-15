# ADR-005: Explicit engineering anchors, not mesh-derived connection points

Status: Accepted
Date: 2026-09-15

## Context

A pole/tower's visual mesh (GLB/GLTF) is authored for visualisation and may not have a
reliable, semantically-labelled vertex at the actual structural connection point (leg
base, pedestal connection, guy attachment, etc.). Inferring a connection point from mesh
geometry (e.g. "lowest vertex of this sub-mesh") is fragile and silently wrong whenever
the mesh's authoring convention doesn't match the assumption (principle #4).

## Decision

Every pole/tower model carries an explicit `anchors` list in its JSON, independent of
the visual mesh: unique ID, human-readable name, anchor type, local position, optional
local orientation, linked leg ID, source, confidence/verification state, notes. All
foundation placement and section generation is driven from anchors, never from mesh
geometry inspection.

## Alternatives considered

- **Infer anchors from mesh bounding boxes / lowest points per sub-mesh** — rejected:
  violates principle #4 directly, and is a well-known source of silent misplacement
  when mesh authoring conventions vary between models or tools.
- **Require anchors to be named vertices/empties inside the GLB itself (glTF node
  extras)** — considered for a later import convenience feature, not rejected outright,
  but deferred: it would still need to be validated against the explicit JSON anchors
  before being trusted, so it doesn't remove the need for this ADR's core decision, and
  adds GLB-parsing complexity not justified before real GLB samples are inspected.

## Consequences

- The visual mesh becomes purely decorative for engineering purposes; an importer that
  validates the mesh's bounding box against declared anchors (flagging large mismatches)
  is required, per the risk noted in the planning response, not optional polish.
- A pole model with no visual mesh at all remains fully usable for foundation placement,
  since anchors don't depend on mesh presence.

## Unresolved risks

- None material at MVP scope; revisit if/when glTF-embedded anchor conventions are
  considered as an import convenience.
