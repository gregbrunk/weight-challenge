"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/server";
import { planTargets } from "@/lib/calc";
import { isPlainDate, type PlainDate } from "@/lib/date";
import { getActivePlan, toPlanInput } from "@/lib/plans";
import {
  deletePhoto,
  getPhotoById,
  isPhotoSlot,
  savePhoto,
  type PhotoSummary,
} from "@/lib/photos";
import { getPhotoStorage, MAX_UPLOAD_BYTES, photoPath } from "@/lib/photos/storage";
import {
  extensionForType,
  isAcceptedImageType,
  looksLikeImage,
} from "@/lib/photos/image-type";

export type PhotoResult =
  | { ok: true; photo: PhotoSummary }
  | { ok: false; error: string };

/**
 * Stores one progress photo against one slot on one day.
 *
 * The browser has already downsized the image before it gets here; the checks
 * below are the server refusing to trust that, since a request can be made by
 * hand. Everything is validated against the active plan rather than anything
 * the client asserts about which plan it belongs to.
 */
export async function uploadPhotoAction(formData: FormData): Promise<PhotoResult> {
  await requireAuth();

  const date = String(formData.get("date") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const file = formData.get("file");

  if (!isPlainDate(date)) return { ok: false, error: "That isn't a valid date." };
  if (!isPhotoSlot(slot)) return { ok: false, error: "Unknown photo slot." };
  if (!(file instanceof File)) return { ok: false, error: "No image was received." };

  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That image is too large. Try a smaller photo." };
  }
  if (!isAcceptedImageType(file.type)) {
    return {
      ok: false,
      error: "Photos must be JPEG, PNG or WebP. iPhone HEIC files need converting first.",
    };
  }

  const plan = await getActivePlan();
  if (!plan) return { ok: false, error: "There's no active plan to add photos to." };

  const planInput = toPlanInput(plan);
  const targets = planTargets(planInput);
  if (date < planInput.startDate || date > targets.endDate) {
    return { ok: false, error: "That date is outside this plan." };
  }

  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, error: "Couldn't read the image dimensions." };
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Check the actual bytes, not the declared type. A mislabelled file would
  // otherwise be stored and then fail to render for good.
  if (!looksLikeImage(data)) {
    return { ok: false, error: "That file doesn't look like an image." };
  }

  const storage = await getPhotoStorage();
  const path = photoPath(plan.id, date as PlainDate, slot, extensionForType(file.type));
  const stored = await storage.put(path, data, file.type);

  const photo = await savePhoto({
    planId: plan.id,
    date: date as PlainDate,
    slot,
    path: stored.path,
    width: Math.round(width),
    height: Math.round(height),
    bytes: stored.bytes,
  });

  revalidatePath("/log");
  revalidatePath("/progress");

  return { ok: true, photo };
}

export async function deletePhotoAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();

  const photo = await getPhotoById(id);
  if (!photo) return { ok: false, error: "That photo no longer exists." };

  // Only photos belonging to the active plan can be removed from the UI, which
  // keeps a stale page from deleting out of an archived plan.
  const plan = await getActivePlan();
  if (!plan || photo.planId !== plan.id) {
    return { ok: false, error: "That photo isn't part of the current plan." };
  }

  await deletePhoto(id);

  revalidatePath("/log");
  revalidatePath("/progress");

  return { ok: true };
}
