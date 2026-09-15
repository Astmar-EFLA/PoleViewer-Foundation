# Coordinate strategy (authoritative)

This document is the single source of truth for the coordinate convention and
transformation chain. Every function that crosses a coordinate space boundary must be
implemented and tested per this document — do not re-derive sign/axis conventions
locally in a feature.

## Coordinate spaces

1. **Source project coordinates** — Easting, Northing, Elevation exactly as read from an
   input (LAS header CRS, pole-model JSON, user entry). Float64. Always carries an
   explicit CRS (EPSG code or explicit CRS text) and explicit horizontal/vertical units.
   Never assumed — if a source doesn't state a CRS, the CRS field is `null` and a
   blocking validation result is raised (principle #1, #13); processing that depends on
   a CRS does not proceed until it is supplied.

2. **Normalised project coordinates** — same physical location, unit-converted to metres
   if the source used something else, elevation-reference type recorded explicitly as
   `"orthometric" | "ellipsoidal" | "project" | "unknown"` (never silently assumed to be
   orthometric). This is the canonical, authoritative coordinate stored in the domain
   layer and saved project.

3. **Mast-centred local engineering coordinates** — right-handed, Z up, local X =
   transverse (perpendicular to line), local Y = longitudinal (along line bearing),
   local Z = vertical. Computed as:

   `local = Rz(-mastRotationRadians) · (projectNormalised - mastCentreProject)`

   where `mastRotationRadians` is the angle needed to rotate the project frame so that
   local +Y aligns with the declared line bearing, and `Rz` is a right-handed rotation
   about the vertical (Z) axis. Bearings are stored and interpreted as **clockwise from
   project/grid north**, matching standard surveying convention; this sign convention is
   resolved in exactly one function (`bearingToRotation` in the geometry layer) and
   never re-derived elsewhere.

4. **Viewer coordinates** — local coordinates minus a floating render origin (normally
   `(0,0,0)`, tracked as its own value distinct from the mast centre — see ADR-004).
   This is the only coordinate space allowed to be cast to `Float32Array` for
   `BufferGeometry`, and that cast must happen as late in the pipeline as possible (in
   the rendering layer, not the domain or geometry layer).

## Units and angles

- All internal domain-layer lengths are metres (float64). Source units are converted at
  import time; the original unit is preserved in provenance, never discarded.
- All internal angles are radians (float64). UI displays degrees by default, gon
  selectable per project; conversion happens only at the UI input/output boundary.
- Right-handed coordinate system throughout.

## Why a mast-centred floating origin (precision justification)

Three.js `BufferGeometry` attributes are `Float32Array`. Float32 has ~24 mantissa bits
(~7.2 decimal digits). At a magnitude of 500,000 m (typical ISN93 Easting/Northing), one
unit in the last place (ULP) is:

```
500,000 * 2^-23 ≈ 0.06 m
```

— already coarser than most foundation dimensions (on the order of 1-3 m), and far
coarser than the sub-centimetre precision required for engineering inspection. This is
principle #8 made quantitative, and is the concrete reason a mast-centred local origin
(ADR-004) is mandatory rather than a style preference.

After subtracting a mast-centred local origin, magnitudes fall into the range typical of
the default 40x40 m extraction plus surrounding context (roughly 50-200 m), giving:

```
200 * 2^-23 ≈ 0.00002 m
```

— sub-millimetre, adequate for engineering geometry.

**Consequence:** the domain layer must always retain full float64 project coordinates.
Only the final render-buffer conversion step (rendering layer) is allowed to touch
float32, and it must happen as late in the pipeline as possible. No calculation, no
validation rule, and no measurement readout may be derived from a float32 buffer value
when the equivalent float64 domain value is available.

## Required round-trip conversions

The application must be able to convert, in both directions, with the tolerances below:

| Conversion | Direction(s) | Precision stage | Tolerance |
|---|---|---|---|
| Project <-> Normalised project | both | pure float64 math (unit conversion only) | 1e-9 m (unit conversion is exact arithmetic; tolerance is for floating-point rounding only) |
| Normalised project <-> Local engineering | both | pure float64 math (translation + rotation) | 1e-6 m |
| Local engineering <-> Viewer | both | pure float64 math (translation only, origin subtraction) | 1e-6 m |
| Viewer (post-render, e.g. a raycast pick) -> Local -> Project | one-way (picking) | has passed through a `Float32Array` `BufferGeometry` stage | 1e-3 m (1 mm) |

The 1e-6 m tolerance for pure-math stages is deliberately tight: these stages are exact
float64 arithmetic (translation and rotation), and any residual above float64 rounding
noise indicates a real bug, not an acceptable approximation. The 1e-3 m tolerance is
used only for the one conversion that has necessarily passed through a float32 buffer
(e.g. converting a raycast hit point, which Three.js reports from float32 vertex data,
back into project coordinates) — this is the measured precision floor from the ULP
analysis above, not an arbitrary looser number.

## Explicit non-assumptions

- No default CRS is ever substituted for a missing one.
- No default unit is ever substituted for an unstated one (the unit field itself is
  required; "assume metres" is not implemented as silent behaviour — a project or
  import missing units is a validation error, even though metres remains the type of
  default a user will almost always pick).
- Easting/Northing order is never inferred or auto-swapped; a suspiciously-ordered pair
  (e.g. values that look transposed relative to a stated CRS's typical range) produces a
  validation warning, never a silent correction.
