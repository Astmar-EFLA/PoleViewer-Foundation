"""
Generates a tiny synthetic orthophoto fixture (a JPEG plus its .jgw world
file) for orthophoto registration (app/processing/orthophoto_import.py).
Axis-aligned (no rotation/skew) -- the common real-world case; the general
affine (rotated) case is covered by frontend/src/geometry/orthophotoUv.test.ts's
pure-math tests, which don't need a real image file.

Run with the Pillow-equipped interpreter (backend/requirements/base.txt).
"""

from PIL import Image

IMAGE_WIDTH_PX = 8
IMAGE_HEIGHT_PX = 6
PIXEL_SIZE_M = 0.5  # each pixel covers 0.5m x 0.5m on the ground
UPPER_LEFT_EASTING = 512_300.0
UPPER_LEFT_NORTHING = 487_700.0

IMAGE_OUTPUT_PATH = "fixtures/synthetic/orthophoto.jpg"
WORLD_FILE_OUTPUT_PATH = "fixtures/synthetic/orthophoto.jgw"


def build_image() -> Image.Image:
    # A simple left-to-right red gradient over a green background -- enough
    # to be a valid, distinctly-non-blank JPEG; pixel content itself isn't
    # asserted on by any test, only the image's dimensions and the world
    # file's georeferencing.
    img = Image.new("RGB", (IMAGE_WIDTH_PX, IMAGE_HEIGHT_PX), (60, 140, 60))
    for x in range(IMAGE_WIDTH_PX):
        for y in range(IMAGE_HEIGHT_PX):
            img.putpixel((x, y), (int(255 * x / (IMAGE_WIDTH_PX - 1)), 140, 60))
    return img


def build_world_file_text() -> str:
    # ESRI world file: pixel size X, rotation Y, rotation X, pixel size Y
    # (negative -- northing decreases as pixel row increases), upper-left X,
    # upper-left Y.
    lines = [
        f"{PIXEL_SIZE_M}",
        "0.0",
        "0.0",
        f"{-PIXEL_SIZE_M}",
        f"{UPPER_LEFT_EASTING}",
        f"{UPPER_LEFT_NORTHING}",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    build_image().save(IMAGE_OUTPUT_PATH, "JPEG", quality=90)
    with open(WORLD_FILE_OUTPUT_PATH, "w", encoding="utf-8") as fh:
        fh.write(build_world_file_text())
    print(f"wrote {IMAGE_OUTPUT_PATH} ({IMAGE_WIDTH_PX}x{IMAGE_HEIGHT_PX}) and {WORLD_FILE_OUTPUT_PATH}")
