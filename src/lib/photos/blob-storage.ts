/**
 * Production driver: Vercel Blob.
 *
 * Blob objects are reachable by anyone holding their URL, so the app never
 * hands one out — photos are always proxied through the authenticated route in
 * /api/photos, and the stored paths carry 16 random bytes so a URL cannot be
 * guessed from a plan id and a date.
 */

import { del, head, put } from "@vercel/blob";
import type { PhotoStorage, StoredPhoto } from "./storage";

export function createBlobStorage(): PhotoStorage {
  return {
    async put(path: string, data: Buffer, contentType: string): Promise<StoredPhoto> {
      const result = await put(path, data, {
        access: "public",
        contentType,
        // The path already carries a nonce; a second one would make the stored
        // pathname disagree with what we record in the database.
        addRandomSuffix: false,
      });

      return { path: result.pathname, bytes: data.byteLength };
    },

    async get(path: string) {
      try {
        const metadata = await head(path);
        const response = await fetch(metadata.url);
        if (!response.ok) return null;

        return {
          data: Buffer.from(await response.arrayBuffer()),
          contentType: metadata.contentType ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },

    async delete(path: string) {
      try {
        await del(path);
      } catch {
        // Already gone is the desired end state.
      }
    },
  };
}
