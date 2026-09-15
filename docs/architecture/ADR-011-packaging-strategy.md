# ADR-011: Packaging strategy for controlled engineering use

Status: Accepted
Date: 2026-09-15

## Context

Through Phase 8, "running the application" means starting two separate local
processes by hand: `vite` (frontend dev server, port 5173) and `uvicorn`
(backend, port 8100), each requiring its own terminal and its own
environment (Node for one, the `pole-viewer-backend` conda environment for
the other). This is fine for development, but Phase 9's goal is "prepare
the application for controlled engineering use" -- an engineer who wants to
open the tool and inspect a project should not need to know what Vite or
conda are, or run two commands in the right order.

## Options considered

1. **Keep the two-dev-process model, document it better.** Zero additional
   engineering. Still requires Node + a conda/PDAL environment installed and
   two processes started correctly, which is a real barrier for anyone who
   isn't already set up for frontend/Python development (see ADR-003's own
   packaging risk note about PDAL on Windows). Rejected as the *only*
   answer for "controlled engineering use", though it remains the right mode
   for active development (fast HMR, source maps).

2. **FastAPI serves the built frontend as static files -- one process, one
   port.** `npm run build` (already an existing script; produces
   `frontend/dist/`) plus `uvicorn app.main:app`; the backend serves the
   built frontend directly when `frontend/dist/` exists (see the
   `StaticFiles` mount in `backend/app/main.py`), so there is exactly one
   process, one port, and no CORS configuration needed at all in that mode
   (the CORS middleware for the two-process dev setup stays; the browser
   simply has nothing to preflight when frontend and backend share an
   origin). Still requires the PDAL/conda environment to be present, since
   the backend itself is unchanged. Low additional engineering cost (the
   static mount, already implemented), meaningful reduction in "how many
   things do I need to run" for a non-developer user.

3. **A single native executable** (e.g. PyInstaller bundling the backend +
   the built frontend, or a conda-pack of the whole environment). Removes
   the "install Python/conda/PDAL yourself" barrier entirely. Rejected *for
   now*: PDAL's own native dependencies (see ADR-003) make a single-exe
   build a nontrivial, easy-to-get-subtly-wrong effort (native library
   paths, GDAL data files, etc.) that deserves its own dedicated pass with
   access to a real Windows test machine, not a same-session addition to an
   already-large phase. Documented here as the clear next step once option 2
   has been used in practice.

4. **Electron (or a similar desktop-shell) wrapper.** Would give a
   double-clickable desktop app, closer to what "controlled engineering use"
   ultimately implies. Rejected for now for the same reason as option 3 --
   it still needs a packaged backend underneath it (Electron doesn't solve
   the PDAL/conda distribution problem, only the frontend's), so it is
   strictly *more* work than option 3 for no additional near-term benefit;
   revisit once option 3 exists.

## Decision

**Option 2**: the backend optionally serves the frontend's production build
directly. `frontend/dist/` is built once (`npm run build`); if
`backend/app/main.py` finds that directory on startup, it mounts it at `/`
(after every API route, so API routes always take priority over the
catch-all static mount) via Starlette's `StaticFiles(html=True)`, which
handles SPA-style fallback to `index.html` and rejects path traversal
outside that directory itself (standard, already-audited Starlette
behaviour -- no new file-access surface is introduced).

This is deliberately additive, not a replacement for the two-process dev
workflow: `frontend/dist/` not existing (a normal `npm run dev` checkout)
leaves `app.py` completely unaffected, CORS included.

## Consequences

- "Controlled engineering use" today means: `npm run build`, then run the
  backend the same way as before (`conda run -n pole-viewer-backend uvicorn
  app.main:app --port 8100`); open `http://127.0.0.1:8100/`. One process,
  one port, no separate Vite server.
- PDAL/conda is still a required install for whoever runs the backend --
  this ADR does not remove that barrier, only the "run two things" barrier.
  A single native package (option 3) remains the way to remove it, and is
  intentionally left for a later, dedicated effort.
- No new security surface: `StaticFiles` only ever serves
  `frontend/dist/`, a build output already produced by this project's own
  toolchain, at a fixed path never derived from request input.
