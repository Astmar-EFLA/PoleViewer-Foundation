# Handoff — pole-viewer

Last updated: 2026-09-30

## What this project is

A local-first 3D engineering viewer for transmission-line pole/tower foundations. The frontend is React + TS + Vite and the backend is FastAPI + PDAL.
- Real decisions are recorded in `docs/architecture/ADR-*.md`.
- `coordinate-strategy.md` and `known-limitations.md` cover the rest.
- Sibling project: `pole-spotter` (`C:\Users\astmar\dev\pole-spotter`), a line-level profile tool that reuses this project's conventions.

## Git state right now

- `master` is at `7a29fae` (the merge of PR #6) and in sync with `origin/master`. The main checkout (`C:\Users\astmar\dev\pole-viewer`) is on `master` and clean.
- Work is now done on a **branch → PR → merge** flow using `gh`. The six PRs below were each opened, then merged with a merge commit once the user asked. The repo has no CI checks and no required reviews.
- Merged feature branches have not been deleted on origin.

## Recently completed (most recent first)

1. **PR #6 — short HS3 type names.** The 15 Hólasandslína 3 types are now named by their designation alone (e.g. `B170-155x155`). The user renamed them in the library editor. Only the names changed, not the ids.
2. **PR #5 — semicolon line CSVs and a template.**
   - `services/csvParsing.ts` detects `,` or `;` from the header row.
   - A semicolon file may use a decimal comma, which is what Excel writes under Icelandic regional settings. Thousands separators are rejected as invalid numbers.
   - `docs/line-csv-template.csv` and `docs/line-csv.md` hold the template and its column reference.
   - The Line panel has a **Download template** button, which imports the template with Vite's `?raw` (`src/rawImports.d.ts`). A test parses the template so it can't drift from the parser.
3. **PR #4 — gravel pad, 1:1 excavation, uplift fill 0.2 m below top.**
   - **The fill layer (`project.fillInstances`) is now a gravel pad (malarpúði).** It is a flat slab, default 0.2 m (`FillInstance.padThicknessM`, optional, falling back to `DEFAULT_GRAVEL_PAD_THICKNESS_M`), that fills the whole excavation floor. Its top is the foundation base (`geometry/gravelPadGeometry.ts`). Volume is exact and needs no terrain.
   - **The excavation floor sits at the pad bottom.** `excavationFoundationSync` offsets by the pad thickness in both directions. Editing the pad thickness moves the excavation, not the foundation.
   - The default excavation slope is 1H:1V. Fills stay at 2H:1V.
   - The uplift fill's default and synced top is `DEFAULT_UPLIFT_FILL_BELOW_TOP_M` (0.2 m) below the foundation top. The rule is now `fill.top-below-pedestal-base`: the uplift fill must cover the pad and tapered transition.
   - The UI and outputs follow: a "Gravel pad" panel and toolbar entry, `GravelPadMesh`, the section view (solid when cut, dashed when projected), DXF `GRAVEL-PAD[-PROJECTED]`, and a report column.
   - The sloped-fill code (`generateFillGeometry`, `FillLayerPanel`, `FillMesh`) now serves only the uplift fill.
4. **PR #3 — inclined pedestals for the HS3 B/F types.**
   - Every B/F drawing leans **1:8 (7.125°)** with its base 50 mm off the pad centre (56 mm on F175). This was read from the plan dimensions and matches the real masts' leg batter.
   - Two optional parameters were added to `rectangular-pad-tapered-pedestal`: `pedestalLeanDegrees` and `pedestalBaseOffset`. When they are absent or 0, the output is exactly as before.
   - `OrientedFrustum` gained an optional `shear` (an oblique frustum). The **pedestal top stays at the instance position** and the pad shifts outboard.
   - An inclined foundation is oriented to lean **toward the mast centre** (`orientationFor` in `services/buildFoundationInstances.ts`). Orientation was always 0 before.
5. **PR #2 — the 15 Hólasandslína 3 precast types in `domain/foundationLibrary.json`.** These are C/CA/B/F, all `rectangular-pad-tapered-pedestal`, from BM Vallá production drawings V20-032 (2020-05-20). CA types have the same concrete geometry as C; the only difference is the cast-in guy loop. `domain/foundationLibrary.test.ts` checks each type against its designation and its title-block volume.
6. **PR #1 (five commits) — report volumes and section DXF.**
   - A per-foundation volume table in the report: concrete, excavation, gravel pad, uplift fill, and a Total row.
   - The batch export saves `<mastName>.dxf` (the transverse section, DXF R12 via `services/dxfWriter.ts` + `sectionDxf.ts`) next to `<mastName>-viewer.html`. Before this, every HTML file got the same project-name filename. Sections also have an **Export DXF** button.
   - Sections draw the **tower** (pole-model members projected onto the plane).
   - A foundation, excavation or fill that the plane misses is **projected** and drawn dashed, e.g. guy-anchor blocks off a transverse section.

## Open, not-yet-actioned items

- **Title blocks to flag to the HS3 designer.** Four title-block volumes don't match their drawing's own dimensions:
  - C/CA180-160x160: 0.96 vs 1.1 m³
  - B270-250x250: 2.22 vs 2.4 m³
  - F175-155x155: 1.13 vs 2.4 m³. This title block is identical to B270's, so it was probably copied.

  These four are excluded from the volume test, not "fixed".
- **Delete the duplicate LAS uploads.** 19 identical copies of `BLL-A-1-DTM-V03.las` (634 MB) plus a test `.pol` were moved to `<workspace>\uploads\_duplicates-to-delete`. They were moved, not deleted, because a network share has no recycle bin. The user needs to delete that folder. Every pick in the Project panel's file picker makes a new upload copy, so referencing files by path (CSV `pointCloudPath`) avoids this.
- **Older projects and the gravel pad.** Older projects open with a 0.2 m pad but keep their excavation floor at the foundation base. The warning `excavation.floor-above-gravel-pad` flags this until the foundation, pad or excavation is edited. Nothing is silently migrated.
- **Pedestal faces are modelled horizontal.** On the HS3 drawings the pedestal top is square to its axis. The cross-section difference is under 1 %.
- **Lower priority, never requested.** The longitudinal/transverse naming mismatch in some domain doc comments (`domain/coordinates.ts`, `domain/foundation.ts`, `domain/poleModel.ts`, `validation/poleModelSchema.ts`, `rendering/threeAdapters.ts`, `geometry/coordinateTransform.ts`). This is comments only.

## Environment facts and gotchas

- **The standalone export template is a build artifact.** `frontend/public/viewer-export-template.html` must be rebuilt with `npm run build:viewer-export` (from `frontend/`) after anything it bundles changes: Scene, Toolbar, the panels, ReportModal, SectionView, the foundation library, or schemas. **Stop any Vite dev server running from the same folder first.** On Windows the build briefly locks a file in `dist-viewer-export/`, and Vite then crashes with `EBUSY`.
- **Backend.** It runs on `127.0.0.1:8100` from `C:\Users\astmar\dev\pole-viewer\backend` in the conda env `C:\Users\astmar\dev\tools\miniforge3\envs\pole-viewer-backend`.
  - **CORS only allows `localhost:5173` / `127.0.0.1:5173`** (`backend/app/main.py`). A frontend on any other port cannot call it.
  - Its workspace root is set per launch with `POLE_VIEWER_WORKSPACE_ROOT`. The current value is `O:\L\Landsnet_2509\109544_Blöndulína 3 - Útboðshönnun\15_Hönnun\PLS_Cadd\struct\All`. It is not a global env var. CSV `modelPath` and `pointCloudPath` are relative to it (subfolders `BS/`, `BSH/`, `BSJ/`, … hold the line's `.pol` models).
- **Performance.** LAS read speed from O: is not the bottleneck: about 0.7 s on the first read, then cached. The terrain crop takes about 1.2–1.9 s per tower and is dominated by PDAL scanning points. Smaller per-tower tiles help far more than a local copy.
- **`gh`** is installed at `C:\Program Files\GitHub CLI\gh.exe` (authenticated as Astmar-EFLA). Shells opened before the install may not have it on PATH.
- **Worktrees.** Claude's worktree `.claude/worktrees/kind-swartz-e16bd7` has `frontend/node_modules` as a **directory junction** to the main checkout's `node_modules`, because the sandbox blocked `npm ci` from reaching the registry. If you delete that worktree by hand, remove the junction with `rmdir` first; never delete it recursively.
- **Checking a feature in the browser.** Run a second dev server on port 5178 (`.claude/launch.json` in the worktree) while the user's app keeps 5173. Because of the CORS rule, a page on 5178 can't reach the backend; fetch backend data with `curl` into a temporary `frontend/public/_tmp_*.json` and delete it afterwards. After hot reloads, `import("/src/state/projectStore.ts")` may resolve to a different module instance than the page's (`?t=` suffix), so reload the page before poking the store from the console.

## Conventions to keep following

- Only commit, open PRs or merge when explicitly asked. The usual request is "commit, PR og sameinaðu": branch from `origin/master`, commit with a descriptive message, `gh pr create --base master`, merge with `--merge --match-head-commit`, then `git pull --ff-only` in the main checkout. Before pulling over a local change, verify it is identical to what was merged.
- Never commit real project data. Only synthetic fixtures generated by committed scripts go in the repo.
- The user writes in Icelandic. Reply in Icelandic; code, commits and PRs are in English.
- Zustand store actions catch their own errors into `status: "loading"|"success"|"error"` state rather than throwing. The exception is `exportProjectAsStandaloneHtml`, which throws `ViewerExportError`.
- Build new features as structural mirrors of existing ones where possible, rather than new abstractions:
  - optional parameters on an existing geometry type instead of a new type (inclined pedestals)
  - a pad `OrientedBox` reusing the box cut, projection and rendering paths
  - projected outlines reusing the convex-hull helper
- Engineering data must never change silently. Flag inconsistencies with validation warnings; never silently rewrite or report a zero.
- Verify everything before reporting done:
  - `npm run typecheck && npm run test`
  - the live app, preferably with a real `.pol` from the workspace
  - `ezdxf` read + audit for DXF output
- Use plan mode for non-trivial multi-file features, and ask via `AskUserQuestion` when a design fork genuinely needs the user's call.
