# ADR-010: Provenance and validation model

Status: Accepted
Date: 2026-09-15

## Context

The application must distinguish measured, imported, user-entered, assumed and
calculated information everywhere (principle #16), and must never hide failed
validation or an unsupported input (principle #12). Without a single shared model for
this, individual features tend to invent ad hoc "source" flags that drift apart and stop
being comparable across the object tree.

## Decision

A single shared `Provenance` value is embedded on every engineering value/object that
can plausibly originate from more than one place: origin type (`imported` |
`user-entered` | `assumed` | `transformed` | `interpolated` | `calculated` |
`library-default`), source file, source hash where practical, source object/row
reference, imported/modified timestamps, calculation method and parameters where
applicable, software version, verification state, notes.

A single shared `ValidationResult` model (rule ID, severity, affected object IDs, title,
detail, evidence, suggested action, timestamp, data version, status) is used for every
validation category (coordinate, point-cloud, terrain, pole, foundation, geotechnical,
excavation) so the UI has one validation panel, not several incompatible ones, and so
"blocking" has one consistent meaning across the whole application.

## Alternatives considered

- **Per-feature ad hoc source/confidence flags** — rejected: this is the status quo
  failure mode this ADR exists to avoid; it doesn't compose (a foundation's "confidence"
  field would mean something different from a geotechnical layer's), and it can't be
  rendered generically in a single property panel.
- **Validation embedded as inline warnings on each object rather than a first-class,
  queryable result list** — rejected: makes "never hide failed validation" hard to
  guarantee, since there'd be no single place to prove all warnings are surfaced.

## Consequences

- Every domain object touched by import, calculation, or user editing must be designed
  with a `Provenance` field from the start, not bolted on later — this shapes the
  domain model schemas directly (see the planning response's §9 field lists).
- Blocking validation results must stop *dependent calculations* (e.g. excavation
  volume) without hiding or blocking inspection of already-valid data (e.g. the terrain
  and foundation geometry the blocking error concerns) — this is a UX rule, not just a
  data rule, and must be tested as such.

## Unresolved risks

- None material at MVP scope.
