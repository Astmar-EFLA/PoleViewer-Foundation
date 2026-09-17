import { describe, expect, it } from "vitest";
import type { OrthophotoWorldFile } from "../domain/orthophoto";
import { computeOrthophotoUv, worldToPixel } from "./orthophotoUv";

describe("worldToPixel: axis-aligned world file", () => {
  const worldFile: OrthophotoWorldFile = {
    pixelSizeX: 0.5,
    rotationY: 0,
    rotationX: 0,
    pixelSizeY: -0.5,
    upperLeftX: 1000,
    upperLeftY: 2000,
  };

  it("maps the upper-left corner to pixel (0, 0)", () => {
    const pixel = worldToPixel(worldFile, 1000, 2000);
    expect(pixel).not.toBeNull();
    expect(pixel!.col).toBeCloseTo(0, 9);
    expect(pixel!.row).toBeCloseTo(0, 9);
  });

  it("maps a point 100 pixels right and 50 pixels down correctly", () => {
    // col=100 -> easting = 1000 + 100*0.5 = 1050; row=50 -> northing = 2000 + 50*(-0.5) = 1975.
    const pixel = worldToPixel(worldFile, 1050, 1975);
    expect(pixel!.col).toBeCloseTo(100, 6);
    expect(pixel!.row).toBeCloseTo(50, 6);
  });

  it("round-trips forward and inverse for an arbitrary point", () => {
    const easting = 1023.7;
    const northing = 1958.2;
    const pixel = worldToPixel(worldFile, easting, northing)!;
    const backEasting = worldFile.upperLeftX + pixel.col * worldFile.pixelSizeX;
    const backNorthing = worldFile.upperLeftY + pixel.row * worldFile.pixelSizeY;
    expect(backEasting).toBeCloseTo(easting, 6);
    expect(backNorthing).toBeCloseTo(northing, 6);
  });

  it("returns null for a degenerate (zero-determinant) transform", () => {
    const degenerate: OrthophotoWorldFile = { ...worldFile, pixelSizeX: 0, pixelSizeY: 0 };
    expect(worldToPixel(degenerate, 1000, 2000)).toBeNull();
  });
});

describe("worldToPixel: rotated world file", () => {
  // A 90-degree rotation: moving one pixel right (+col) moves north
  // (+northing) instead of east; moving one pixel down (+row) moves east.
  const rotated: OrthophotoWorldFile = {
    pixelSizeX: 0,
    rotationY: 1,
    rotationX: 1,
    pixelSizeY: 0,
    upperLeftX: 500,
    upperLeftY: 500,
  };

  it("correctly inverts a rotated affine transform", () => {
    // Forward: easting = 0*col + 1*row + 500, northing = 1*col + 0*row + 500.
    // At col=3, row=7: easting = 7+500=507, northing = 3+500=503.
    const pixel = worldToPixel(rotated, 507, 503)!;
    expect(pixel.col).toBeCloseTo(3, 6);
    expect(pixel.row).toBeCloseTo(7, 6);
  });
});

describe("computeOrthophotoUv", () => {
  const worldFile: OrthophotoWorldFile = {
    pixelSizeX: 1,
    rotationY: 0,
    rotationX: 0,
    pixelSizeY: -1,
    upperLeftX: 0,
    upperLeftY: 100,
  };
  const width = 100;
  const height = 100;

  it("maps the image's upper-left corner to UV (0, 1) -- top of the texture", () => {
    const uv = computeOrthophotoUv(worldFile, width, height, 0, 100);
    expect(uv.u).toBeCloseTo(0, 9);
    expect(uv.v).toBeCloseTo(1, 9);
  });

  it("maps the image's lower-right corner to UV (1, 0) -- bottom of the texture", () => {
    const uv = computeOrthophotoUv(worldFile, width, height, 100, 0);
    expect(uv.u).toBeCloseTo(1, 9);
    expect(uv.v).toBeCloseTo(0, 9);
  });

  it("maps the centre to UV (0.5, 0.5)", () => {
    const uv = computeOrthophotoUv(worldFile, width, height, 50, 50);
    expect(uv.u).toBeCloseTo(0.5, 9);
    expect(uv.v).toBeCloseTo(0.5, 9);
  });
});
