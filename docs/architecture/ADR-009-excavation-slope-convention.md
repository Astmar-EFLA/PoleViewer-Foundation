# ADR-009: Excavation side-slope convention (H:V)

Status: Accepted for MVP, pending confirmation against a real EFLA reference document
Date: 2026-09-15

## Context

Excavation side slopes can be expressed as H:V (e.g. "1.5H:1V"), V:H, or a single
gradient ratio/percentage, depending on source convention. Storing and computing against
an ambiguous internal convention is a direct route to a silent factor-of-N error in
excavation footprint and volume (principle #7). No real EFLA excavation reference
document has been inspected yet.

## Decision

Store and compute internally using a single explicit convention: horizontal distance
per unit vertical distance, displayed and labelled as **H:V** everywhere in the UI
(e.g. `1.5H:1V`, `2H:1V`, `3H:1V`). If a source document uses a different convention,
convert explicitly at import time and preserve the original value verbatim in the
excavation instance's provenance metadata (not just the converted value).

## Alternatives considered

- **V:H convention** — rejected as primary: H:V is the more common civil/geotechnical
  presentation convention in the reference material available, but this choice is
  explicitly flagged as unconfirmed against real EFLA practice (see Unresolved risks).
- **Single gradient ratio (e.g. `1:1.5` with an implicit H-then-V or V-then-H order)** —
  rejected: ambiguous without an explicit order label, which is exactly the kind of
  silent-convention risk this ADR exists to avoid; H and V are always displayed as
  separate, explicitly labelled values instead.

## Consequences

- Every excavation instance must carry both the internal H:V value and, when converted
  from another source convention, the original value and convention label in provenance
  — a conversion is never a value-only overwrite.

## Unresolved risks

- **This ADR's default convention is unconfirmed against real EFLA design documents**
  (see planning-response §4, item 5). It must be revisited before Phase 6 acceptance
  criteria are treated as representing real practice, not just internal consistency.
