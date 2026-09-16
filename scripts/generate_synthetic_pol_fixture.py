"""
Generates a small, synthetic PLS-POLE (.pol) fixture for the pole-model
import path (app/processing/pol_import.py).

This is a hand-built, minimal text file that matches the block structure
(the "# shapes" / "Undeformed Geometry" markers, node/element/coordinate
line layout, and quoted label+size property lines) verified against a
real PLS-POLE 21.01 export -- not a real project file. It models a small
synthetic 2-pole guyed H-frame: two legs ("LA", "LB"), a bridge between
their tops, one guy cable (from the elevated "LA:t" attachment point down
to its own ground anchor node, labelled "$Gnd1" -- the real export's own
convention for a guy's ground-level anchor, distinct from and NOT to be
confused with the elevated "<name>:t" attachment point at the other end of
the same cable), one insulator element, and one node with a label this
importer does not recognise (to exercise the "unmatched labels" warning
path).

Run with any Python 3 interpreter (no dependencies): writes
fixtures/synthetic/pole-model-2leg.pol.
"""

OUTPUT_PATH = "fixtures/synthetic/pole-model-2leg.pol"

# node_id -> (label, x, y, z)
NODES = {
    1: ("LA:g", 0.0, -3.0, 0.0),
    2: ("LA:t", 0.0, -3.0, 10.0),
    3: ("LB:g", 0.0, 3.0, 0.0),
    4: ("LB:t", 0.0, 3.0, 10.0),
    5: ("$Gnd1", 0.0, -8.0, 0.0),  # guy ground anchor -- NOT the same as "LA:t" (guy-attachment)
    6: ("Misc", 0.0, 0.0, 5.0),  # a labelled node this importer's heuristic does not recognise
}

# (i, j, element line) -- element lines follow the same token layout as a
# real PLS-POLE element line: i j elemnum flags 'Type' f1 f2 'Group' f3 f4
# diaTop diaBot f5 f6 f7 f8 f9 thk thk2 'Section' ''
ELEMENTS = [
    "1 2 1 100 'Beam' 0 0 'LA' 1 1 0.114 0.114 0 0 0 0 0 0.006 0.006 'Tube 1' ''",
    "3 4 2 100 'Beam' 0 0 'LB' 1 1 0.114 0.114 0 0 0 0 0 0.006 0.006 'Tube 1' ''",
    "2 4 3 100 'Truss' -1 0 'Bridge1' 2 2 0.05 0.05 0 0 0 0 0 '' ''",
    "2 5 4 100 'Cable' 0 0 'Guy1' 0 0 0 0 0 0 0 0 0 0 0 '' ''",
    "2 6 5 100 'Suspension' 0 0 '1' 0 0 0 0 0 0 0 0 0 0 0 '' ''",
]


def build_pol_text() -> str:
    n_nodes = len(NODES)
    n_elems = len(ELEMENTS)

    lines: list[str] = []
    lines.append("TYPE='PLS_POLE INPUT FILE' VERSION='22' UNITS='INTERNAL' SOURCE='synthetic fixture'")
    lines.append("'Guy1' '2x14mm' 1 2 3 ; synthetic guy size property")
    lines.append("'1' 'DropX:DropEnd' 'TipX' '1x12xU160BLP' 0 0.000000 ; synthetic insulator string property")
    lines.append("")
    lines.append(f"{n_nodes} {n_elems} 1 1 0 0 20")
    lines.append("19 ; # shapes for each shape shape index, # points, x,y for each point")
    lines.append("Undeformed Geometry")
    for node_id, (label, _x, _y, _z) in NODES.items():
        lines.append(f"{node_id} 0 '{label}' ''")
    for elem_line in ELEMENTS:
        lines.append(elem_line)
    for _node_id, (_label, x, y, z) in NODES.items():
        lines.append(f"{x} {y} {z}")

    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    with open(OUTPUT_PATH, "w", encoding="latin-1") as fh:
        fh.write(build_pol_text())
    print(f"Wrote {OUTPUT_PATH}")
