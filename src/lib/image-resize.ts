/**
 * Client-side image downsizing.
 *
 * A modern phone camera produces 3–5MB per shot. Three slots across a 93-day
 * plan is roughly 280 photos, which at full size would be over a gigabyte —
 * past the free storage tier and slow to upload on a phone. Resizing to a
 * 1600px long edge brings each one to roughly 200–400KB, so the whole plan
 * lands around 80MB and every upload finishes quickly.
 *
 * Doing it in the browser also means the original never leaves the device.
 *
 * `fitWithin` is separated out and pure so the arithmetic can be tested without
 * a canvas.
 */

/** Longest edge, in pixels, of a stored photo. */
export const MAX_EDGE = 1600;

/** JPEG quality. 0.82 is where the file size stops falling much. */
export const JPEG_QUALITY = 0.82;

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Scales dimensions so the longest edge is at most `maxEdge`, preserving the
 * aspect ratio. Images already inside the bound are returned untouched — there
 * is nothing to gain from enlarging one.
 */
export function fitWithin(source: Dimensions, maxEdge: number = MAX_EDGE): Dimensions {
  const { width, height } = source;

  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxEdge && height <= maxEdge) return { width, height };

  const scale = maxEdge / Math.max(width, height);

  // Round rather than floor, and never fall below one pixel on either edge.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

/**
 * Decodes, orients, downsizes and re-encodes an image chosen from the camera
 * or photo library.
 *
 * `imageOrientation: "from-image"` applies the EXIF rotation that phones write
 * instead of rotating the pixels, so a portrait shot doesn't arrive sideways.
 */
export async function resizeImage(
  file: File,
  maxEdge: number = MAX_EDGE,
  quality: number = JPEG_QUALITY,
): Promise<ResizedImage> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Most often an iPhone HEIC that Safari didn't convert on the way in.
    throw new ImageDecodeError(
      "That image couldn't be read. If it came from an iPhone, try taking or saving it as a JPEG.",
    );
  }

  try {
    const target = fitWithin({ width: bitmap.width, height: bitmap.height }, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new ImageDecodeError("This browser couldn't process the image.");
    }

    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) {
      throw new ImageDecodeError("This browser couldn't encode the image.");
    }

    return { blob, width: target.width, height: target.height, type: "image/jpeg" };
  } finally {
    // Frees the decoded pixels immediately rather than waiting for collection,
    // which matters on a phone doing three of these in a row.
    bitmap.close();
  }
}
