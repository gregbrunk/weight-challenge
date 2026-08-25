/**
 * Production driver: Vercel Blob, with private access.
 *
 * Blobs are stored as `private`, which means they are not reachable by URL at
 * all — reading one requires the store's token, which lives only on the server.
 * That is a real improvement over a public blob at an unguessable path: there,
 * a URL that leaked once (a screenshot, a log line, a shared link) would grant
 * permanent access to a progress photo. Here it grants nothing.
 *
 * Photos are still served through the authenticated route in /api/photos, so
 * the app's password governs access and the storage location is never exposed.
 */

// Importing this from a client component is a build error, not a runtime
// one — which is the point. Three separate bugs in this project were a
// client component pulling a server module in through a shared constant.
import "server-only";

import { del, get, put } from "@vercel/blob";
import type { PhotoStorage, StoredPhoto } from "./storage";

export function createBlobStorage(): PhotoStorage {
  return {
    async put(path: string, data: Buffer, contentType: string): Promise<StoredPhoto> {
      const result = await put(path, data, {
        access: "private",
        contentType,
        // The path already carries a nonce; a second one would make the stored
        // pathname disagree with what we record in the database.
        addRandomSuffix: false,
      });

      return { path: result.pathname, bytes: data.byteLength };
    },

    async get(path: string) {
      try {
        const result = await get(path, { access: "private" });

        // Null is "no such blob". A 304 can't happen here because we send no
        // conditional header, but the union includes it, so it's handled
        // rather than assumed away.
        if (!result || result.statusCode !== 200 || !result.stream) return null;

        return {
          data: Buffer.from(await new Response(result.stream).arrayBuffer()),
          contentType: result.blob.contentType ?? "application/octet-stream",
        };
      } catch {
        // A row can outlive its blob; a missing photo is not a server error.
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
