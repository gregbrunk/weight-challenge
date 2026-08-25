/**
 * The resize arithmetic decides whether 93 days of progress photos fit in the
 * free storage tier, and whether a portrait phone shot stays portrait. The
 * canvas work needs a browser; this covers the maths that decides what it does.
 */

import { describe, expect, it } from "vitest";
import { fitWithin, JPEG_QUALITY, MAX_EDGE } from "./image-resize";

describe("fitWithin", () => {
  it("leaves an image already inside the bound untouched", () => {
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it("never enlarges a small image", () => {
    // Upscaling adds bytes and no detail.
    expect(fitWithin({ width: 320, height: 240 })).toEqual({ width: 320, height: 240 });
  });

  it("scales a landscape photo by its width", () => {
    // A 4032x3024 iPhone shot, landscape.
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("scales a portrait photo by its height", () => {
    // The same shot held upright — the common case for a progress photo.
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("preserves the aspect ratio to within a rounded pixel", () => {
    const source = { width: 4032, height: 3024 };
    const result = fitWithin(source);

    const sourceRatio = source.width / source.height;
    const resultRatio = result.width / result.height;

    expect(Math.abs(sourceRatio - resultRatio)).toBeLessThan(0.001);
  });

  it("keeps the long edge exactly at the maximum", () => {
    for (const source of [
      { width: 6000, height: 4000 },
      { width: 4000, height: 6000 },
      { width: 5000, height: 5000 },
    ]) {
      const result = fitWithin(source);
      expect(Math.max(result.width, result.height)).toBe(MAX_EDGE);
    }
  });

  it("handles a square image", () => {
    expect(fitWithin({ width: 3000, height: 3000 })).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it("never collapses an extreme panorama to zero pixels", () => {
    // 10000x1 is absurd, but rounding down would produce a zero-height canvas,
    // and drawImage throws on that.
    const result = fitWithin({ width: 10000, height: 1 });

    expect(result.width).toBe(MAX_EDGE);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("returns zeroes for a degenerate input rather than NaN", () => {
    expect(fitWithin({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
    expect(fitWithin({ width: -100, height: 50 })).toEqual({ width: 0, height: 0 });
  });

  it("respects a custom bound", () => {
    expect(fitWithin({ width: 4000, height: 2000 }, 400)).toEqual({
      width: 400,
      height: 200,
    });
  });
});

describe("encoding settings", () => {
  it("targets a size that keeps a full plan inside the free tier", () => {
    // 1600px at quality 0.82 lands around 200-400KB. Three slots across 93 days
    // is ~280 photos, so roughly 60-110MB — comfortably inside 1GB.
    expect(MAX_EDGE).toBe(1600);
    expect(JPEG_QUALITY).toBeGreaterThan(0.7);
    expect(JPEG_QUALITY).toBeLessThan(0.9);
  });
});
