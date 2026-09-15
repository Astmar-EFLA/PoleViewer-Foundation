"""
Processing guards (Phase 9: "processing guards"). This backend has no
queueing or worker isolation -- every request runs the PDAL pipeline
synchronously on the request thread -- so the only practical defence
against a very large or unbounded file/result is to reject it explicitly,
before PDAL touches the file or before a huge response is serialised,
rather than let the process hang or exhaust memory mid-request. Limits are
configurable (env vars) rather than hard-coded, since "how big is too big"
depends on the operator's machine, not this codebase.
"""

from __future__ import annotations

import os
from pathlib import Path


class ProcessingLimitError(ValueError):
    """Raised when a file or request exceeds a configured processing guard."""


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def max_file_size_bytes() -> int:
    return _env_int("POLE_VIEWER_MAX_FILE_SIZE_MB", 500) * 1024 * 1024


def max_returned_point_count() -> int:
    return _env_int("POLE_VIEWER_MAX_RETURNED_POINTS", 2_000_000)


def check_file_size(path: Path) -> None:
    size = path.stat().st_size
    limit = max_file_size_bytes()
    if size > limit:
        raise ProcessingLimitError(
            f'"{path.name}" is {size / (1024 * 1024):.1f} MB, over the configured processing '
            f"limit of {limit / (1024 * 1024):.0f} MB (POLE_VIEWER_MAX_FILE_SIZE_MB)."
        )


ALLOWED_POINT_CLOUD_EXTENSIONS = {".las", ".laz"}


def check_point_cloud_extension(path: Path) -> None:
    if path.suffix.lower() not in ALLOWED_POINT_CLOUD_EXTENSIONS:
        raise ProcessingLimitError(
            f'"{path.name}" does not have a recognised point-cloud extension '
            f"({', '.join(sorted(ALLOWED_POINT_CLOUD_EXTENSIONS))}). Refusing to run it through "
            "the LAS/LAZ pipeline."
        )
