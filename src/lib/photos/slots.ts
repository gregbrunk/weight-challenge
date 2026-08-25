/**
 * Photo slot vocabulary and shapes.
 *
 * Deliberately free of database imports: client components need these labels
 * and types, and importing them from the data-access module would drag Prisma
 * — and through it, Node's `fs` and `dns` — into the browser bundle.
 */

import type { PhotoSlot } from "@/generated/prisma/client";
import type { PlainDate } from "@/lib/date";

/** Front, side, back — in the order they're shown. */
export const PHOTO_SLOTS = ["front", "side", "back"] as const;

export const SLOT_LABELS: Record<PhotoSlot, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

export function isPhotoSlot(value: unknown): value is PhotoSlot {
  return typeof value === "string" && (PHOTO_SLOTS as readonly string[]).includes(value);
}

export interface PhotoSummary {
  id: string;
  date: PlainDate;
  slot: PhotoSlot;
  width: number;
  height: number;
}
