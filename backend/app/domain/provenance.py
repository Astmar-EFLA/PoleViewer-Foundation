"""
Mirrors frontend/src/domain/provenance.ts (ADR-010) -- the backend has
never needed to produce provenance-carrying domain objects before (only
point-cloud processing results), so this is the first Python port of it,
for the new PLS-POLE (.pol) import (app/processing/pol_import.py).
"""

from __future__ import annotations

from typing import Literal

from app.schemas.camel_model import CamelModel

ProvenanceOriginType = Literal[
    "imported",
    "user-entered",
    "assumed",
    "transformed",
    "interpolated",
    "calculated",
    "library-default",
]

VerificationState = Literal["unverified", "verified", "rejected"]


class Provenance(CamelModel):
    origin_type: ProvenanceOriginType
    source_file: str | None = None
    source_file_hash: str | None = None
    source_ref: str | None = None
    imported_at: str | None = None
    modified_at: str | None = None
    calculation_method: str | None = None
    calculation_parameters: dict | None = None
    software_version: str | None = None
    verification_state: VerificationState
    notes: str | None = None
