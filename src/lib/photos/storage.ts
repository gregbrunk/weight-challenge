/**
 * Photo storage.
 *
 * Two drivers behind one interface. Development writes to a directory on disk,
 * which needs no account and no token; production writes to Vercel Blob, since
 * a serverless filesystem is ephemeral and unshared. The driver is chosen by
 * whether BLOB_READ_WRITE_TOKEN is set, so local work needs no configuration
 * and deploying needs no code change.
 *
 * Nothing outside this module knows which one is in use. Callers deal in
 * opaque storage paths, and photos are always served through the authenticated
 * route in /api/photos rather than by a storage URL.
 */

import { randomBytes } from "node:crypto";
import type { PhotoSlot } from "@/generated/prisma/client";
import type { PlainDate } from "@/lib/date";

export interface StoredPhoto {
  /** Opaque path, meaningful only to the driver that produced it. */
  path: string;
  bytes: number;
}

export interface PhotoStorage {
  put(path: string, data: Buffer, contentType: string): Promise<StoredPhoto>;
  get(path: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(path: string): Promise<void>;
}

/**
 * Where a photo lives.
 *
 * The random suffix does two jobs: it stops a replacement from being served
 * from a cache under its predecessor's URL, and it makes the path unguessable.
 * That second property matters because Vercel Blob URLs are reachable by
 * anyone holding them — the app never hands one out, but an unguessable path
 * means a leaked URL is the only way to reach the file.
 */
export function photoPath(
  planId: string,
  date: PlainDate,
  slot: PhotoSlot,
  extension = "jpg",
): string {
  const nonce = randomBytes(16).toString("hex");
  return `plans/${planId}/${date}/${slot}-${nonce}.${extension}`;
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

let cached: PhotoStorage | null = null;

/** The active driver for this process. */
export async function getPhotoStorage(): Promise<PhotoStorage> {
  if (cached) return cached;

  if (isBlobConfigured()) {
    const { createBlobStorage } = await import("./blob-storage");
    cached = createBlobStorage();
  } else {
    const { createLocalStorage } = await import("./local-storage");
    cached = createLocalStorage();
  }

  return cached;
}

/**
 * Server-side ceiling on an upload.
 *
 * The browser downsizes to roughly 200–400KB before sending, so anything near
 * this limit means the client-side resize didn't run — a hand-rolled request,
 * or a browser without canvas support. Either way it shouldn't reach storage.
 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
