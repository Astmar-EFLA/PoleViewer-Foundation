# ADR-012: PLS-POLE (.pol) import strategy

Status: Accepted
Date: 2026-09-15

## Context

A user-supplied reference script (`pole_viewer.py`) already parses PLS-POLE
geometry exports (`.pol`) into nodes/elements/categories and renders them as
a standalone HTML viewer. The request was to bring that same capability
into this application, for the mast/tower model specifically -- not just as
a one-off conversion, but as a real "load a pole model from a .pol file"
workflow.

A `.pol` file is a full FEM-style geometry dump: every node and every
structural/cable/insulator element PLS-POLE analysed, with no inherent
concept of "this is the anchor a foundation attaches to." This app's own
`PoleModel` domain type is the opposite: a small set of explicitly named
`Anchor`s is the sole source of truth for foundation placement (ADR-005) --
never inferred from a visual mesh.

## Decision

1. **Parsing lives in the backend, not the browser.** The parser
   (`backend/app/processing/pol_import.py`, ported and adapted from the
   reference script) reads the file server-side and returns an already-
   validated `PoleModel` over `POST /polemodel/import`, through the same
   workspace-path security and processing guards (file size, extension) as
   every other file-based endpoint. `.pol` files are plain text but can be
   large and are easiest to parse with a script already proven against real
   exports; there is no reason to re-implement that parsing in TypeScript.

2. **Anchors are derived from a node-labelling heuristic, not a dump of
   every node.** Only nodes whose label matches `<name>:g` (leg base),
   `<name>:t` (top/guy attachment), `<name>:XD` (cross-arm), or `$GndN`
   (a guy's own ground-level anchor -- see "Bug found and fixed" below)
   become `Anchor`s; `<name>:g` additionally becomes a `StructuralLeg`. This
   convention was observed in, and verified against, one real PLS-POLE
   21.01 export (a 2-pole guyed H-frame) -- it is **not** a documented
   PLS-POLE standard, and a file using a different labelling convention
   will import with zero anchors (a clear, non-silent
   `PolImportError: "No leg-base nodes were found"`) rather than guess.
   Every node label the heuristic *doesn't* recognise is still reported in
   `PoleModel.warnings`, not silently dropped.

3. **Mast centre is always calculated, never read from a label.** The
   real export used to verify this parser has a node literally named
   `Center` -- but its actual coordinates put it at cross-arm height
   (~21m), not ground level: it is a dropper/conductor reference point, not
   a mast centre. Discovered only by checking the coordinates, not by
   trusting the label. The importer therefore always computes the mast
   centre as the centroid of the identified leg-base anchors and tags it
   `originType: "calculated"`, with a warning -- a real single-source
   inconsistency this ADR exists partly to record, since it would be an
   easy mistake to repeat with a different file.

4. **Every other node/segment becomes `PoleVisualGeometry`, a new
   rendering-only field on `PoleModel`** (`frontend/src/domain/poleModel.ts`,
   mirrored in `backend/app/domain/pole_model.py`): line segments tagged
   `structure` / `cable` / `insulator`, each with a readable size/profile
   label. Rendered by `rendering/PoleMembersMesh.tsx` as one draw call per
   category. This is explicitly **never** consulted by any calculation
   (foundation placement, sections, measurements) -- it exists only so the
   imported structure is visually recognisable, the same separation ADR-006
   already establishes between domain data and its rendering.

5. **Axis assignment is never guessed.** A `.pol` file's own X/Y axes carry
   no information about the transmission line's transverse/longitudinal
   directions, since PLS-POLE analyses one structure in isolation. The
   importer takes the file's X/Y/Z directly (no swap, no rotation) and adds
   an explicit warning that `modelOrientationRadians` needs a human decision
   once the real line bearing is known.

6. **Importing replaces the whole pole model, not just adds to it.** Since
   the legs/anchors are wholesale different, foundations and excavations
   are rebuilt from scratch with default parameters (the same defaults the
   synthetic demo project uses -- see `services/projectDefaults.ts`), and
   sections/measurements that could reference now-nonexistent legs or
   foundation instances are reset to the same two default sections a new
   project starts with, rather than leaving dangling references.

## Consequences

- A `.pol` file using a different node-labelling convention than the one
  export this was verified against will not import automatically; extending
  the heuristic (or making it configurable) is future work, not attempted
  here since a second real example was not available to verify against.
- Every anchor imported this way carries `verificationState: "unverified"`
  and the mast centre additionally carries `originType: "calculated"` --
  consistent with this app's provenance model (ADR-010), an import is a
  starting point for review, not a verified engineering position.
- A synthetic fixture (`fixtures/synthetic/pole-model-2leg.pol`, built by
  `scripts/generate_synthetic_pol_fixture.py`) exercises the same block
  structure and is what the automated test suite runs against -- the real
  export used to verify this parser during development was never committed
  to the repository (per this project's synthetic-fixtures-only rule).

## Bug found and fixed during verification

`Provenance`'s optional fields (`sourceFileHash`, `modifiedAt`, etc.) were
serialised by Pydantic as JSON `null` when unset; the frontend's Zod
schemas use `.optional()` (field *absent*), which rejects an explicit
`null`. Fixed with `response_model_exclude_none=True` on the
`/polemodel/import` route so an unset field is omitted, not nulled --
caught only by testing live against the real export, not by either
language's test suite in isolation (see
`test_import_endpoint_omits_unset_optional_provenance_fields_rather_than_sending_null`).

**Guy foundations were built at the wrong anchor entirely.** When guy-anchor
foundation support was added, `<name>:t` (`guy-attachment`) was treated as
"the anchor a guy's foundation connects to." It is not: `<name>:t` is the
*elevated* point where the guy leaves the pole/crossarm -- the far end of
the same guy cable element is a **separate node**, the guy's actual
ground-level anchor, which in the real export this was verified against is
labelled `$Gnd1`, `$Gnd2`, etc. (visible in the file's "Guy Connectivity"
block: each guy's origin/joint pair is `<name>:t` (or `<name>:XD`) paired
with `$GndN`). Building a foundation at `guy-attachment` placed it up at
guy-attachment height instead of on the ground -- caught only because a
user who knows PLS-POLE's conventions pointed out the foundations were
"up there in the mast" instead of on the ground. Fixed by adding a
`$Gnd\d+` pattern (case-insensitive) recognised as a new anchor type,
`guy-ground-anchor`, distinct from `guy-attachment`; `guy-attachment`
remains an anchor (useful for review) but is never used for foundation
placement. See `test_dollar_gnd_labelled_node_becomes_a_guy_ground_anchor_distinct_from_the_elevated_attachment_point`.
