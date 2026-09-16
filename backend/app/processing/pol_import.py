"""
Imports a PLS-POLE geometry export (.pol) into this application's
PoleModel domain shape.

The low-level text parsing (the "# shapes" / "Undeformed Geometry" block
layout, element-line tokenisation, guy/insulator property lookup) is
ported from a user-authored reference script (pole_viewer.py, which reads
real PLS-POLE 21.01 exports and renders them as a standalone HTML
viewer), and was verified line-by-line against a real 2-pole guyed H-frame
export before being adapted here -- see the fixture this module's tests
run against for a small, synthetic stand-in with the same block structure.

Anchors are never a blind dump of every node in the file (ADR-005:
anchors are the sole source of truth for foundation placement, never
inferred from a visual mesh). Only nodes whose label matches a recognised
structural-connection convention become anchors; every other node/segment
is still imported, but only as PoleVisualGeometry -- a rendering-only
layer, explicitly tagged as such and never consulted for foundation
placement.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.domain.coordinates import LocalCoordinate
from app.domain.pole_model import (
    Anchor,
    AnchorType,
    PoleMember,
    PoleMemberCategory,
    PoleModel,
    PoleVisualGeometry,
    StructuralLeg,
)
from app.domain.provenance import Provenance


class PolImportError(ValueError):
    """Raised when a .pol file cannot be parsed, or has no recognisable leg-base anchor."""


STRUCTURE_TYPES = {"Beam", "Truss"}
INSULATOR_TYPES = {"Suspension", "Strain"}

# A node label naming a recognised structural connection point:
# "<name>:g" (ground/leg base), "<name>:t" (top, guy-attachment level),
# "<name>:XD" (cross-arm/davit attachment). This is a heuristic tied to
# the labelling convention observed in the real export this was built and
# verified against -- not a documented PLS-POLE standard. Every match is
# reported in the returned warnings so an engineer can verify it before
# relying on it for foundation placement.
_ANCHOR_SUFFIX_RE = re.compile(r"^([A-Za-z0-9]+):(g|t|XD)$")
_ANCHOR_TYPE_BY_SUFFIX: dict[str, AnchorType] = {
    "g": "leg-to-foundation",
    "t": "guy-attachment",
    "XD": "cross-arm-reference",
}
_ANCHOR_NAME_BY_SUFFIX = {"g": "leg base", "t": "top", "XD": "cross-arm"}

# A guy's GROUND anchor -- where the guy actually meets the earth and needs
# a foundation -- is a completely separate node from its elevated
# "<name>:t" pole-side attachment point (the far end of the same guy cable
# element). In the real export this was verified against, ground anchors
# are labelled "$Gnd1", "$Gnd2", etc. (see the "Guy Connectivity" block,
# where each guy's origin/joint pair is "<name>:t"/"<name>:XD" paired with
# "$GndN"). A foundation must be built at this node, never at the elevated
# "guy-attachment" anchor -- building it there was a real bug (foundations
# ended up floating at guy-attachment height instead of on the ground).
_GND_ANCHOR_RE = re.compile(r"^\$Gnd\d+$", re.IGNORECASE)


def _quoted_tokens(line: str) -> list[str]:
    out = []
    i = 0
    while True:
        a = line.find("'", i)
        if a == -1:
            break
        b = line.find("'", a + 1)
        if b == -1:
            break
        out.append(line[a + 1 : b])
        i = b + 1
    return out


def _first_quoted(line: str) -> str:
    toks = _quoted_tokens(line)
    return toks[0] if toks else ""


def classify(etype: str) -> PoleMemberCategory:
    if etype in STRUCTURE_TYPES:
        return "structure"
    if etype in INSULATOR_TYPES:
        return "insulator"
    return "cable"


def _split_tokens(line: str) -> list[tuple[bool, str]]:
    """Splits an element line into (is_quoted, text) tokens; ';' starts a trailing comment and is dropped."""
    out: list[tuple[bool, str]] = []
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        if ch == ";":
            break
        if ch.isspace():
            i += 1
            continue
        if ch == "'":
            j = line.find("'", i + 1)
            if j == -1:
                out.append((True, line[i + 1 :]))
                break
            out.append((True, line[i + 1 : j]))
            i = j + 1
        else:
            j = i
            while j < n and not line[j].isspace():
                j += 1
            out.append((False, line[i:j]))
            i = j
    return out


def _as_float(s: str | None) -> float | None:
    try:
        return float(s) if s is not None else None
    except ValueError:
        return None


def _scan_properties(lines: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    """Scans the whole file for quoted label+size pairs (guy sizes, insulator string properties) that live outside the geometry block itself."""
    guy_size: dict[str, str] = {}
    str_prop: dict[str, str] = {}
    guy_re = re.compile(r"^\s*'([^']+)'\s+'([^']*?(?:mm|kV)[^']*)'")
    ins_re = re.compile(r"^\s*'([^']+)'\s+'[^']*'\s+'[^']*'\s+'([^']+)'")
    for ln in lines:
        m = guy_re.match(ln)
        if m and m.group(1) not in guy_size:
            guy_size[m.group(1)] = m.group(2).strip()
            continue
        m = ins_re.match(ln)
        if m:
            lbl, prop = m.group(1).strip(), m.group(2).strip()
            if prop and lbl not in str_prop and re.search(r"\dx\d", prop):
                str_prop[lbl] = prop
    return guy_size, str_prop


def _fmt_dim(dia_top: float | None, dia_bot: float | None, thk_m: float | None) -> str:
    if not dia_top or dia_top <= 0:
        return ""
    d1 = dia_top * 1000.0
    if dia_bot and abs(dia_bot - dia_top) > 1e-6:
        core = f"Ø{d1:.1f}–{dia_bot * 1000.0:.1f}"
    else:
        core = f"Ø{d1:.1f}"
    if thk_m and thk_m > 0:
        return f"{core}×{thk_m * 1000.0:.1f} mm"
    return f"{core} mm"


def _element_size(
    parts: list[tuple[bool, str]],
    cat: PoleMemberCategory,
    type_tok: str,
    guy_size: dict[str, str],
    str_prop: dict[str, str],
) -> str:
    """A readable size/profile label for one element, e.g. 'Tube 1 · Ø177.8×8.0 mm' or '2x21mm'."""
    quoted = [t for q, t in parts if q]
    group = parts[7][1] if len(parts) > 7 and parts[7][0] else ""
    section = quoted[2].strip() if len(quoted) > 2 and quoted[2].strip() else ""
    vals = [t for _, t in parts]
    dia_top = _as_float(vals[10]) if len(vals) > 10 else None
    dia_bot = _as_float(vals[11]) if len(vals) > 11 else None
    thk = _as_float(vals[17]) if len(vals) > 17 else None
    dim = _fmt_dim(dia_top, dia_bot, thk)

    if cat == "cable":
        for key in (group, type_tok):
            if key in guy_size:
                return guy_size[key]
        base = group or type_tok or "(unknown)"
        return f"{base} · {dim}" if dim else base
    if cat == "insulator":
        for key in (group, type_tok):
            if key in str_prop:
                return str_prop[key]
        return group or type_tok or "(unknown)"
    base = section or group or "(unknown)"
    return f"{base} · {dim}" if dim else base


def _parse_geometry(
    lines: list[str],
) -> tuple[dict[int, tuple[float, float, float]], dict[int, str], list[dict]]:
    guy_size, str_prop = _scan_properties(lines)

    try:
        shape_idx = next(i for i, ln in enumerate(lines) if "# shapes" in ln)
    except StopIteration as exc:
        raise PolImportError(
            "This does not look like a valid PLS-POLE .pol model (no '# shapes' block found)."
        ) from exc
    hdr = lines[shape_idx - 1].split()
    n_nodes = int(hdr[0])
    n_elems = int(hdr[1])

    try:
        geo_idx = next(i for i, ln in enumerate(lines) if ln.strip() == "Undeformed Geometry")
    except StopIteration as exc:
        raise PolImportError(
            "This does not look like a valid PLS-POLE .pol model (no 'Undeformed Geometry' block found)."
        ) from exc

    node_lines = lines[geo_idx + 1 : geo_idx + 1 + n_nodes]
    elem_lines = lines[geo_idx + 1 + n_nodes : geo_idx + 1 + n_nodes + n_elems]
    coord_lines = lines[geo_idx + 1 + n_nodes + n_elems : geo_idx + 1 + 2 * n_nodes + n_elems]

    if not (len(node_lines) == len(coord_lines) == n_nodes and len(elem_lines) == n_elems):
        raise PolImportError("The geometry block is not in the expected shape (node/element counts don't match).")

    node_index = [int(ln.split()[0]) for ln in node_lines]
    node_label = {node_index[k]: _first_quoted(node_lines[k]) for k in range(n_nodes)}
    coords: list[tuple[float, float, float]] = []
    for ln in coord_lines:
        p = ln.split()
        coords.append((float(p[0]), float(p[1]), float(p[2])))
    nodes = {node_index[k]: coords[k] for k in range(n_nodes)}

    elements: list[dict] = []
    for ln in elem_lines:
        tok = ln.split()
        try:
            i, j = int(tok[0]), int(tok[1])
        except (ValueError, IndexError):
            continue
        if i not in nodes or j not in nodes:
            continue
        parts = _split_tokens(ln)
        type_tok = parts[4][1] if len(parts) > 4 and parts[4][0] else _first_quoted(ln)
        cat = classify(type_tok)
        comp = _element_size(parts, cat, type_tok, guy_size, str_prop)
        elements.append({"i": i, "j": j, "category": cat, "component": comp})

    return nodes, node_label, elements


def parse_pol(path: Path, now_iso: str) -> PoleModel:
    with path.open("r", encoding="latin-1") as fh:
        lines = [ln.rstrip("\n") for ln in fh]

    nodes, node_label, elements = _parse_geometry(lines)

    members = [
        PoleMember(
            a=LocalCoordinate(x=nodes[e["i"]][0], y=nodes[e["i"]][1], z=nodes[e["i"]][2]),
            b=LocalCoordinate(x=nodes[e["j"]][0], y=nodes[e["j"]][1], z=nodes[e["j"]][2]),
            category=e["category"],
            component=e["component"],
        )
        for e in elements
    ]

    warnings: list[str] = [
        "Local X/Y/Z are taken directly from the PLS-POLE file's own axes, with no swap or "
        "rotation applied -- this file's X/Y assignment relative to the line's transverse/"
        "longitudinal directions has not been confirmed. Adjust modelOrientationRadians once "
        "the real line bearing is known."
    ]

    imported_provenance = Provenance(
        origin_type="imported",
        source_file=path.name,
        imported_at=now_iso,
        verification_state="unverified",
        notes="Position imported directly from the PLS-POLE (.pol) file's own geometry block.",
    )

    leg_anchors: list[Anchor] = []
    other_anchors: list[Anchor] = []
    structural_legs: list[StructuralLeg] = []
    unmatched_labels: set[str] = set()

    for node_id, label in node_label.items():
        if not label:
            continue
        if _GND_ANCHOR_RE.match(label):
            x, y, z = nodes[node_id]
            anchor_id = f"anchor-{label.lower().lstrip('$')}"
            other_anchors.append(
                Anchor(
                    id=anchor_id,
                    name=f"{label} (guy ground anchor)",
                    anchor_type="guy-ground-anchor",
                    local_position=LocalCoordinate(x=x, y=y, z=z),
                    source=imported_provenance,
                    verification_state="unverified",
                )
            )
            continue
        m = _ANCHOR_SUFFIX_RE.match(label)
        if not m:
            unmatched_labels.add(label)
            continue
        prefix, suffix = m.group(1), m.group(2)
        x, y, z = nodes[node_id]
        anchor_id = f"anchor-{label.lower().replace(':', '-')}"
        anchor = Anchor(
            id=anchor_id,
            name=f"{prefix} {_ANCHOR_NAME_BY_SUFFIX[suffix]}",
            anchor_type=_ANCHOR_TYPE_BY_SUFFIX[suffix],
            local_position=LocalCoordinate(x=x, y=y, z=z),
            linked_leg_id=(f"leg-{prefix.lower()}" if suffix == "g" else None),
            source=imported_provenance,
            verification_state="unverified",
        )
        if suffix == "g":
            leg_anchors.append(anchor)
            structural_legs.append(
                StructuralLeg(
                    id=f"leg-{prefix.lower()}",
                    name=prefix,
                    linked_foundation_anchor_id=anchor_id,
                    source=imported_provenance,
                )
            )
        else:
            other_anchors.append(anchor)

    if not leg_anchors:
        raise PolImportError(
            "No leg-base nodes were found (looked for node labels matching '<name>:g', e.g. "
            "'LP:g'). This file's labelling convention isn't one this importer recognises, so "
            "it cannot place foundations without at least one leg-base anchor."
        )

    if unmatched_labels:
        preview_list = sorted(unmatched_labels)
        preview = ", ".join(preview_list[:15])
        more = "" if len(preview_list) <= 15 else f" (+{len(preview_list) - 15} more)"
        warnings.append(
            f"{len(unmatched_labels)} labelled node(s) in the source file were not recognised as "
            f"structural anchors and were imported only as visual geometry, not as inspectable "
            f"anchors: {preview}{more}."
        )

    # Mast centre is always calculated as the centroid of the leg-base
    # anchors -- never assumed to be any single labelled node in the
    # source file. (A node literally named "Center" in the real export
    # this was verified against turned out to be a cross-arm/dropper
    # reference point well above ground, not a ground-level mast centre --
    # discovered only by checking its actual coordinates, not by trusting
    # the label.)
    centre_x = sum(a.local_position.x for a in leg_anchors) / len(leg_anchors)
    centre_y = sum(a.local_position.y for a in leg_anchors) / len(leg_anchors)
    centre_z = sum(a.local_position.z for a in leg_anchors) / len(leg_anchors)
    mast_centre_anchor = Anchor(
        id="anchor-mast-centre",
        name="Mast centre (calculated)",
        anchor_type="mast-centre",
        local_position=LocalCoordinate(x=centre_x, y=centre_y, z=centre_z),
        source=Provenance(
            origin_type="calculated",
            calculation_method="centroid of leg-base anchors",
            verification_state="unverified",
            notes=f"Calculated as the centroid of {len(leg_anchors)} leg-base anchor(s); not an imported value.",
        ),
        verification_state="unverified",
    )
    warnings.append(
        f"Mast centre was calculated as the centroid of {len(leg_anchors)} leg-base anchor(s) -- "
        "verify against survey data before relying on it."
    )

    return PoleModel(
        schema_version="0.1.0",
        model_id=f"pol-import-{path.stem}",
        name=path.stem,
        description=f"Imported from PLS-POLE file {path.name}.",
        source=Provenance(
            origin_type="imported",
            source_file=path.name,
            imported_at=now_iso,
            verification_state="unverified",
            notes="Imported from a PLS-POLE (.pol) geometry export; anchor/leg identification is heuristic (see warnings).",
        ),
        units="m",
        coordinate_convention="right-handed-x-transverse-y-longitudinal-z-up",
        local_origin=LocalCoordinate(x=0, y=0, z=0),
        model_orientation_radians=0.0,
        mast_centre_anchor_id="anchor-mast-centre",
        anchors=[mast_centre_anchor, *leg_anchors, *other_anchors],
        structural_legs=structural_legs,
        metadata={"sourceFormat": "pls-pole-pol", "nodeCount": len(nodes), "elementCount": len(elements)},
        warnings=warnings,
        visual_geometry=PoleVisualGeometry(
            members=members,
            source=Provenance(
                origin_type="imported",
                source_file=path.name,
                imported_at=now_iso,
                verification_state="unverified",
                notes="Rendering-only structural geometry imported from the .pol file -- not an anchor source (ADR-005).",
            ),
        ),
    )
