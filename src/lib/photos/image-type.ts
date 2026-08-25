/**
 * Format detection by magic number.
 *
 * A file's declared MIME type comes from the client and can say anything. This
 * reads the actual leading bytes, so a mislabelled or hand-crafted upload is
 * rejected before it reaches storage rather than being stored and then failing
 * to render for good.
 */

/** Only formats a browser canvas can produce and every browser can display. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function extensionForType(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The format these bytes actually are, or null if it isn't one we accept. */
export function detectImageType(data: Uint8Array): AcceptedImageType | null {
  if (data.length < 12) return null;

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";

  // PNG: 89 "PNG" CR LF SUB LF
  if (PNG_SIGNATURE.every((byte, index) => data[index] === byte)) return "image/png";

  // WebP: "RIFF" ....size.... "WEBP"
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...data.subarray(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";

  return null;
}

export function looksLikeImage(data: Uint8Array): boolean {
  return detectImageType(data) !== null;
}
