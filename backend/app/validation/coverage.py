"""
Tells the user, explicitly, when the mast centre is outside a terrain
source's coverage -- the usual reason a clip comes back empty (e.g. the
project CRS left at ISN93 while the mast was entered for a Swedish file, or
a mast centre never moved off the demo coordinates). Shared by the point
cloud and DEM paths.
"""

from __future__ import annotations

from app.schemas.pointcloud import ProcessingWarning


def mast_outside_extent_warning(
    code_prefix: str,
    source_label: str,
    min_easting: float,
    max_easting: float,
    min_northing: float,
    max_northing: float,
    mast_easting: float,
    mast_northing: float,
) -> ProcessingWarning | None:
    """None when the mast centre is inside the extent; otherwise a warning quoting both, in the extent's own coordinates."""
    inside = min_easting <= mast_easting <= max_easting and min_northing <= mast_northing <= max_northing
    if inside:
        return None
    return ProcessingWarning(
        code=f"{code_prefix}.mast-outside-file-bounds",
        severity="warning",
        message=(
            f"The mast centre (E {mast_easting:.1f}, N {mast_northing:.1f}) is outside the {source_label}'s "
            f"extent (E {min_easting:.1f}-{max_easting:.1f}, N {min_northing:.1f}-{max_northing:.1f}). "
            "Check the mast centre and the project coordinate system (Project panel)."
        ),
    )
