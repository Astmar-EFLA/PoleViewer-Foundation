# Handoff — pole-viewer

Last updated: 2026-09-25

## What this project is

Local-first 3D engineering viewer for transmission-line pole/tower foundations
(React + TS + Vite frontend, FastAPI + PDAL backend). See
`docs/architecture/ADR-*.md` for real decisions, `coordinate-strategy.md` and
`known-limitations.md` for the rest. Sibling project: `pole-spotter`
(`C:\Users\astmar\dev\pole-spotter`), a line-level profile tool reusing this
project's conventions.

## Git state right now

- Branch `master`, ahead of `origin/master` (not pushed).
- Recent commits: `4325d5b` — "Add tapered-pedestal foundations, batch HTML
  export, and fix section labels"; `9b67433` — "Rebuild viewer export
  template for tapered-pedestal foundations" (the rebuilt prebuilt
  standalone-export artifact — see "Known gotcha" below); then this
  handoff note itself.
- Working tree clean.

## Recently completed (this repo, most recent first)

1. **Fixed a real bug**: `frontend/public/viewer-export-template.html` is a
   *prebuilt* static artifact (`npm run build:viewer-export`), not
   hand-written. It hadn't been rebuilt since the tapered-pedestal foundation
   type was added, so every "Export interactive HTML" produced a file whose
   bundled Zod schema didn't know the new `geometryType` literal —
   `Could not load the embedded project: ... Invalid discriminator value`.
   Rebuilt it and verified live (exported a project with a tapered-pedestal
   foundation, reopened the standalone HTML, loads clean). Committed as
   `9b67433`.
2. Commit `4325d5b` (already pushed to local master, not to origin):
   - New foundation type `rectangular-pad-tapered-pedestal` (pad → sloped
     frustum → pedestal), matching a real EFLA footing drawing. Wired into
     3D rendering, 2D section triangulation, schema, library, and
     `scripts/foundation-library-editor.html`.
   - Batch HTML export from the whole-line CSV with manual per-mast
     checkbox selection (`rendering/LinePanel.tsx`), because LAS survey
     coverage differs per tower. New optional CSV columns `pointCloudPath`
     and `foundationTypeId`.
   - Section view now opens zoomed to the structure, not the full
     terrain/geotech extent.
   - **Fixed a real labeling bug**: "Longitudinal" and "Transverse" section
     modes were swapped relative to real transmission-line convention
     (`geometry/section.ts`'s `buildSectionPlane`, and independently
     `services/projectDefaults.ts`'s `buildDefaultSections`). Both fixed;
     tests updated.

## Open, not-yet-actioned items

- **Report volume calculations** (last thing being scoped, not started): the
  user asked for the report's volume section to be broken out **per
  foundation, plus a summed total** — today `computeExcavationMaterialQuantities`
  and `computeFillMaterialQuantities` only report **project-wide totals**
  (excavation additionally breaks out by geotech category, fill doesn't
  break out at all). Separately, confirmed there is **no foundation concrete
  volume calculation anywhere in the codebase** — only excavated-soil and
  placed-fill volumes exist. Proposed direction (not yet approved): add a
  `geometry/foundationVolume.ts` (box: `8*hx*hy*hz`; frustum: reuse the
  existing `h/3*(A1+A2+sqrt(A1*A2))` formula already used in
  `geometry/excavationVolume.ts`) + a new
  `services/foundationMaterialQuantities.ts` service, then extend
  `rendering/ReportModal.tsx` with a per-foundation table (concrete +
  excavation + fill + uplift-fill volume per leg, totals row). **This needs
  scope confirmation from the user before building** — specifically whether
  excavation/fill should *also* get per-foundation breakdown (not just
  totals) in the same pass, since that touches
  `services/excavationMaterialQuantities.ts` and
  `services/fillMaterialQuantities.ts` too.
- Lower-priority, explicitly flagged, not requested: the same
  longitudinal/transverse naming mismatch also exists in unrelated
  domain-level doc comments (`domain/coordinates.ts`, `domain/foundation.ts`,
  `domain/poleModel.ts`, `validation/poleModelSchema.ts`,
  `rendering/threeAdapters.ts` describing local X/Y axis naming). Doesn't
  affect any `directionRadians` value or behavior — cosmetic/comment-only.
  Only pursue if the user raises it.

## Known gotcha to remember

`frontend/public/viewer-export-template.html` is a **build artifact**, not
source. Anything that changes `viewer-export/` or anything it renders
(Scene, Toolbar, ReportModal, or any domain/validation type they depend on —
e.g. adding a new foundation type, a new fill layer, a new schema field)
requires re-running:

```bash
npm run build:viewer-export
```

from `frontend/` before "Export interactive HTML" will produce a working
file again. There's no automated check for staleness — this has already bitten
once (see above). Consider whether a CI/pre-commit check would be worth
adding at some point.

## Conventions to keep following

- Only commit when explicitly asked ("commit this"). Never commit real
  project data — only synthetic fixtures generated by committed scripts.
- Zustand store actions self-catch into `status: "loading"|"success"|"error"`
  state rather than throwing (callers `await` then re-read
  `get().slice.status`) — except `exportProjectAsStandaloneHtml`, which
  genuinely throws `ViewerExportError`.
- New features are built as structural mirrors of existing ones where
  possible (Fill mirrors Excavation inverted, Uplift Fill reuses Fill's
  types/geometry unchanged, the tapered-pedestal frustum triangulation
  mirrors the existing box triangulation) rather than new abstractions.
- Verify everything live (browser via the built-in preview tools, or
  `npm run typecheck && npm run test`) wherever possible before reporting
  done.
- Use plan mode for non-trivial multi-file features; ask via
  `AskUserQuestion` when a design fork genuinely needs the user's call.
