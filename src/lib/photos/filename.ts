/**
 * Download filenames for progress photos.
 *
 * Client-safe: no database, no `node:` APIs. It sits beside `slots.ts` for the
 * same reason — the vocabulary a client component might need stays clear of
 * anything that would drag Prisma into the browser bundle.
 *
 * A file leaving the app lands in a folder full of other downloads, so the name
 * has to say what it is on its own: which app, which day, which angle. Sorting
 * a folder by name then puts a plan in chronological order, and the three
 * angles of a day next to each other.
 */

import type { PhotoSlot } from "@/generated/prisma/client";
import type { PlainDate } from "@/lib/date";
import { extensionForType } from "./image-type";

const PREFIX = "weight-challenge";

/**
 * Anything outside this set is dropped rather than escaped.
 *
 * The date and slot are both constrained values, so in practice nothing is
 * ever stripped. It is here because this string ends up inside a quoted
 * `Content-Disposition` header, where a stray quote or newline would let the
 * value break out of the header — and a filename is exactly the kind of field
 * that gets loosened later by someone adding a user-supplied caption to it.
 */
function safe(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * e.g. `weight-challenge-2026-08-27-front.jpg`
 *
 * The extension follows the stored file's actual content type rather than
 * being assumed, so a photo saved before the client-side JPEG re-encode still
 * downloads under a name its own bytes match.
 */
export function photoFileName(
  date: PlainDate,
  slot: PhotoSlot,
  contentType: string,
): string {
  return `${PREFIX}-${safe(date)}-${safe(slot)}.${extensionForType(contentType)}`;
}
