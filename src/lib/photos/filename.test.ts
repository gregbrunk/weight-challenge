import { describe, expect, it } from "vitest";
import { photoFileName } from "./filename";

describe("photoFileName", () => {
  it("names a photo by app, date and angle", () => {
    expect(photoFileName("2026-08-27", "front", "image/jpeg")).toBe(
      "weight-challenge-2026-08-27-front.jpg",
    );
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ])("uses the extension for %s", (type, extension) => {
    expect(photoFileName("2026-08-27", "side", type)).toBe(
      `weight-challenge-2026-08-27-side.${extension}`,
    );
  });

  /**
   * Everything the app stores is a JPEG the browser re-encoded, but the row
   * outlives any one upload path. An unknown type falls back rather than
   * producing a file with no extension, which some systems refuse to open.
   */
  it("falls back to jpg for a type it doesn't know", () => {
    expect(photoFileName("2026-08-27", "back", "application/octet-stream")).toBe(
      "weight-challenge-2026-08-27-back.jpg",
    );
  });

  it.each(["front", "side", "back"] as const)("handles the %s slot", (slot) => {
    expect(photoFileName("2026-01-01", slot, "image/jpeg")).toBe(
      `weight-challenge-2026-01-01-${slot}.jpg`,
    );
  });

  /**
   * The result is interpolated into a quoted Content-Disposition header, so a
   * quote or newline reaching it would let the value break out of the header.
   * Neither input can carry one today; this is the guard for when one of them
   * grows a free-text component.
   */
  it("strips anything that could break out of the header", () => {
    const name = photoFileName(
      '2026-08-27"; drop=1' as never,
      'front\r\nX-Injected: yes' as never,
      "image/jpeg",
    );

    expect(name).not.toContain('"');
    expect(name).not.toContain("\r");
    expect(name).not.toContain("\n");
    expect(name).not.toContain(";");
    expect(name).not.toContain(" ");
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });

  it("sorts a plan chronologically, and a day's angles together", () => {
    const names = [
      photoFileName("2026-09-02", "front", "image/jpeg"),
      photoFileName("2026-08-27", "side", "image/jpeg"),
      photoFileName("2026-08-27", "back", "image/jpeg"),
    ].sort();

    expect(names).toEqual([
      "weight-challenge-2026-08-27-back.jpg",
      "weight-challenge-2026-08-27-side.jpg",
      "weight-challenge-2026-09-02-front.jpg",
    ]);
  });
});
