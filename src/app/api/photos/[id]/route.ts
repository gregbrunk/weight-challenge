/**
 * Serves a progress photo.
 *
 * Photos go through here rather than by a storage URL, so the app's password
 * actually protects them. A Vercel Blob URL is reachable by anyone holding it;
 * this route checks the session on every request and never reveals the
 * underlying location.
 *
 * Runs on Node rather than Edge because the session check reads the database.
 */

import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth/server";
import { getPhotoById } from "@/lib/photos";
import { photoFileName } from "@/lib/photos/filename";
import { getPhotoStorage } from "@/lib/photos/storage";
import { fromDbDate } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/photos/[id]">,
) {
  if (!(await hasValidSession())) {
    // 404 rather than 401: without a session there's no reason to confirm that
    // a given photo id exists.
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const photo = await getPhotoById(id);
  if (!photo) return new NextResponse(null, { status: 404 });

  const storage = await getPhotoStorage();
  const object = await storage.get(photo.blobPath);

  // The row can outlive its file — a cleared storage directory, or a failed
  // upload. A missing file is a missing photo, not a server error.
  if (!object) return new NextResponse(null, { status: 404 });

  // ?download=1 is the same bytes under a different disposition. Saving is a
  // header, not a second copy of the file, so there is nothing here that can
  // drift from what the viewer is showing.
  //
  // What downloads is the stored photo, which is the 1600px JPEG the browser
  // produced before uploading — the camera original never reaches the server
  // by design, so it is not a thing this route could offer.
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="${photoFileName(fromDbDate(photo.date), photo.slot, object.contentType)}"`
    : "inline";

  return new NextResponse(new Uint8Array(object.data), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.data.byteLength),
      // Private, because this response is specific to an authenticated
      // session and must never be held in a shared cache. Immutable because
      // the path carries a nonce, so a replacement gets a new id anyway.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
