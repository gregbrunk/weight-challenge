/**
 * Progress photo records.
 *
 * A photo is a row plus an object in storage. The row is the source of truth:
 * if the two ever disagree, a row without its file renders as a broken slot
 * rather than crashing a page, and a file without its row is simply orphaned.
 */

import type { Photo, PhotoSlot } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fromDbDate, toDbDate } from "@/lib/plans";
import type { PlainDate } from "@/lib/date";
import { getPhotoStorage } from "./storage";
import type { PhotoSummary } from "./slots";

// Re-exported so server code has one import for both. Client components must
// import from "./slots" directly — this module reaches the database.
export { PHOTO_SLOTS, SLOT_LABELS, isPhotoSlot } from "./slots";
export type { PhotoSummary } from "./slots";

function toSummary(photo: Photo): PhotoSummary {
  return {
    id: photo.id,
    date: fromDbDate(photo.date),
    slot: photo.slot,
    width: photo.width,
    height: photo.height,
  };
}

export async function getPhotosForDate(
  planId: string,
  date: PlainDate,
): Promise<PhotoSummary[]> {
  const photos = await prisma.photo.findMany({
    where: { planId, date: toDbDate(date) },
  });

  return photos.map(toSummary);
}

/** Every photo in a plan, oldest first — the timeline on the Progress screen. */
export async function getPhotosForPlan(planId: string): Promise<PhotoSummary[]> {
  const photos = await prisma.photo.findMany({
    where: { planId },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });

  return photos.map(toSummary);
}

/** Dates that have at least one photo, oldest first. */
export async function getPhotoDates(planId: string): Promise<PlainDate[]> {
  const rows = await prisma.photo.findMany({
    where: { planId },
    distinct: ["date"],
    orderBy: { date: "asc" },
    select: { date: true },
  });

  return rows.map((row) => fromDbDate(row.date));
}

export async function getPhotoById(id: string): Promise<Photo | null> {
  return prisma.photo.findUnique({ where: { id } });
}

/**
 * Stores a photo, replacing whatever occupied the slot.
 *
 * The new object is written before the old row is updated, so a failure part
 * way through leaves the previous photo intact rather than a row pointing at
 * nothing. The old object is deleted last, and a failure there costs an
 * orphaned file rather than a broken slot.
 */
export async function savePhoto(params: {
  planId: string;
  date: PlainDate;
  slot: PhotoSlot;
  path: string;
  width: number;
  height: number;
  bytes: number;
}): Promise<PhotoSummary> {
  const { planId, date, slot, path, width, height, bytes } = params;
  const dbDate = toDbDate(date);

  const existing = await prisma.photo.findUnique({
    where: { planId_date_slot: { planId, date: dbDate, slot } },
  });

  const photo = await prisma.photo.upsert({
    where: { planId_date_slot: { planId, date: dbDate, slot } },
    create: { planId, date: dbDate, slot, blobPath: path, width, height, bytes },
    update: { blobPath: path, width, height, bytes },
  });

  if (existing && existing.blobPath !== path) {
    const storage = await getPhotoStorage();
    await storage.delete(existing.blobPath);
  }

  return toSummary(photo);
}

/** Removes the row and the object. */
export async function deletePhoto(id: string): Promise<boolean> {
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return false;

  await prisma.photo.delete({ where: { id } });

  const storage = await getPhotoStorage();
  await storage.delete(photo.blobPath);

  return true;
}
