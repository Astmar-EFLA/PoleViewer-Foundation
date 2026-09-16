"""
Mirrors frontend/src/domain/poleModel.ts, plus the new `PoleMember` /
`PoleVisualGeometry` types (rendering-only lattice geometry from an
imported PLS-POLE (.pol) file -- see app/processing/pol_import.py).
Anchors remain the sole source of truth for foundation placement (ADR-005)
regardless of whether visual geometry is present.
"""

from __future__ import annotations

from typing import Literal

from app.domain.coordinates import LocalCoordinate
from app.domain.provenance import Provenance
from app.schemas.camel_model import CamelModel

AnchorType = Literal[
    "mast-centre",
    "leg-to-foundation",
    "pole-base",
    "pedestal-connection",
    "guy-attachment",
    "guy-ground-anchor",
    "cross-arm-reference",
    "conductor-attachment",
    "local-alignment-reference",
    "custom",
]


class Anchor(CamelModel):
    id: str
    name: str
    anchor_type: AnchorType
    local_position: LocalCoordinate
    linked_leg_id: str | None = None
    source: Provenance
    verification_state: Literal["unverified", "verified", "rejected"]
    notes: str | None = None


class StructuralLeg(CamelModel):
    id: str
    name: str
    linked_foundation_anchor_id: str
    source: Provenance


PoleMemberCategory = Literal["structure", "cable", "insulator"]


class PoleMember(CamelModel):
    a: LocalCoordinate
    b: LocalCoordinate
    category: PoleMemberCategory
    component: str


class PoleVisualGeometry(CamelModel):
    members: list[PoleMember]
    source: Provenance


class PoleModel(CamelModel):
    schema_version: str
    model_id: str
    name: str
    description: str | None = None
    source: Provenance
    units: Literal["m", "ft", "us-ft"]
    coordinate_convention: Literal["right-handed-x-transverse-y-longitudinal-z-up"]
    local_origin: LocalCoordinate
    model_orientation_radians: float
    mast_centre_anchor_id: str
    visual_asset_ref: str | None = None
    anchors: list[Anchor]
    structural_legs: list[StructuralLeg]
    metadata: dict | None = None
    warnings: list[str]
    visual_geometry: PoleVisualGeometry | None = None
