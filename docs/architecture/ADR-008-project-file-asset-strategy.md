# ADR-008: Project-file and asset-reference strategy

Status: Accepted
Date: 2026-09-15

## Context

Projects combine a relatively small amount of structured engineering data (coordinates,
foundation parameters, geotechnical assumptions) with potentially large binary assets
(LAS/LAZ point clouds, GLB visual meshes). Embedding large binaries directly in JSON is
impractical and makes diffing/versioning the engineering data unnecessarily hard.

## Decision

A project is a workspace **folder**, not a single file: `project.json` (structured
engineering data, versioned schema) plus an `assets/` subfolder holding registered
source files referenced by relative path. Every referenced asset carries a content hash
in `project.json`'s provenance metadata. Large binary assets (LAS/LAZ, GLB) are never
inlined into `project.json`.

## Alternatives considered

- **Single self-contained archive file (zip-like) containing JSON + assets** — not
  rejected outright, but deferred: it's a reasonable later packaging step (e.g. for
  sharing a project as one file) built *on top of* the folder+hash model, not a
  replacement for it; implementing it before the folder model is proven adds
  unnecessary complexity to the MVP.
- **Inline base64-encoded assets in JSON** — rejected: violates the "core engineering
  files should remain plainly inspectable/traceable" spirit of the provenance
  requirements, bloats the JSON, and makes hashing/change-detection needlessly
  roundabout.

## Consequences

- Moved or hash-mismatched assets must be explicitly detected and surfaced on project
  load as a validation result, not silently re-linked or silently ignored (principle
  #12).
- Relative paths (not absolute) are used in `project.json` so a workspace folder can be
  moved or shared as a unit without breaking asset references, provided the assets move
  with it.

## Unresolved risks

- Behaviour when an asset is present but has a different hash than recorded (edited
  externally) needs a defined UX (block vs. warn-and-relink-with-new-hash) — deferred to
  Phase 8 design, tracked here so it isn't forgotten.

## Phase 8 resolution (partial)

The missing/mismatched-hash behaviour above is resolved: `PointCloudSourceReference`
carries a `contentHash` (SHA-256, computed by a new backend endpoint,
`POST /workspace/file-status`, added specifically because the frontend cannot read
workspace files directly). A missing asset is a **blocking** validation result
(`asset.point-cloud-missing`); a present-but-hash-mismatched asset is a **warning**
(`asset.point-cloud-hash-mismatch`) — usable, but flagged, never silently re-linked or
silently ignored. See `validation/assetValidation.ts`.

What is **not** yet implemented: `project.json` is not actually written into the
backend's workspace folder next to `assets/`. "Save"/"Reopen" (Phase 8) currently use a
plain browser file download/upload for `project.json`, wherever the user chooses to keep
it -- independent of the backend's `POLE_VIEWER_WORKSPACE_ROOT`. This means a project
file and the workspace its `pointCloudSource.filePath` is relative to are not guaranteed
to travel together as one folder, which is what "a project is a workspace folder" was
meant to guarantee. Closing that gap (writing/reading `project.json` through the backend
workspace, or a real single-archive packaging step) remains open for a later phase.
