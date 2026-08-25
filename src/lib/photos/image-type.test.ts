/**
 * The declared MIME type on an upload comes from the client and can say
 * anything. These tests cover the byte-level check that decides what actually
 * reaches storage.
 */

import { describe, expect, it } from "vitest";
import {
  ACCEPTED_IMAGE_TYPES,
  detectImageType,
  extensionForType,
  isAcceptedImageType,
  looksLikeImage,
} from "./image-type";

/** Real file headers, padded to a plausible length. */
const jpeg = () => bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = () =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = () =>
  bytes([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50, // "WEBP"
  ]);

function bytes(values: number[]): Uint8Array {
  return Uint8Array.from([...values, ...new Array(32).fill(0)]);
}

describe("detectImageType", () => {
  it("recognises the three formats we accept", () => {
    expect(detectImageType(jpeg())).toBe("image/jpeg");
    expect(detectImageType(png())).toBe("image/png");
    expect(detectImageType(webp())).toBe("image/webp");
  });

  it("rejects a text file renamed to .jpg", () => {
    const text = new TextEncoder().encode("this is definitely not an image at all");
    expect(detectImageType(text)).toBeNull();
  });

  it("rejects a PDF, GIF and a ZIP", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n");
    const gif = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
    const zip = bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);

    expect(detectImageType(pdf)).toBeNull();
    expect(detectImageType(gif)).toBeNull();
    expect(detectImageType(zip)).toBeNull();
  });

  it("rejects a RIFF container that isn't WebP", () => {
    // A WAV file is also RIFF; only the WEBP fourcc counts.
    const wav = bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectImageType(wav)).toBeNull();
  });

  it("rejects anything too short to identify", () => {
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("doesn't mistake a near-miss PNG signature", () => {
    const almost = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 0, 0, 0, 0]);
    expect(detectImageType(almost)).toBeNull();
  });
});

describe("looksLikeImage", () => {
  it("agrees with detectImageType", () => {
    expect(looksLikeImage(jpeg())).toBe(true);
    expect(looksLikeImage(new TextEncoder().encode("nope, not an image here"))).toBe(false);
  });
});

describe("isAcceptedImageType", () => {
  it("accepts exactly the declared list", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(isAcceptedImageType(type)).toBe(true);
    }
  });

  it("rejects formats a browser can't reliably display", () => {
    // HEIC is what an iPhone produces natively, and Safari is the only browser
    // that renders it — hence the explicit message on the upload path.
    for (const type of ["image/heic", "image/gif", "image/svg+xml", "application/pdf", ""]) {
      expect(isAcceptedImageType(type)).toBe(false);
    }
  });

  it("rejects SVG, which can carry script", () => {
    expect(isAcceptedImageType("image/svg+xml")).toBe(false);
  });
});

describe("extensionForType", () => {
  it("maps each accepted type to its extension", () => {
    expect(extensionForType("image/jpeg")).toBe("jpg");
    expect(extensionForType("image/png")).toBe("png");
    expect(extensionForType("image/webp")).toBe("webp");
  });

  it("falls back to jpg, matching what the client encoder produces", () => {
    expect(extensionForType("application/octet-stream")).toBe("jpg");
  });
});
