"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PhotoSlot } from "@/generated/prisma/client";
import { formatWithWeekday, type PlainDate } from "@/lib/date";
import { SLOT_LABELS } from "@/lib/photos/slots";

export interface ViewerPhoto {
  id: string;
  slot: PhotoSlot;
  date: PlainDate;
  /** Shown in the caption where the caller knows it. */
  dayNumber?: number;
  /** Bumped when a photo is replaced, so the <img> refetches rather than
   *  showing the file it replaced from cache. */
  version?: number;
}

interface Props {
  photos: ViewerPhoto[];
  /** The photo being shown, or null when the viewer is closed. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/**
 * Full-size photo viewer, shared by the Log and Progress screens.
 *
 * A native `<dialog>` opened with `showModal`, which brings the focus trap, the
 * backdrop, Escape-to-close and inertness of the page behind it — a lot of
 * correctness not to have to hand-roll, and easy to get subtly wrong by hand.
 *
 * The open state is driven by the `index` prop rather than by an imperative
 * call at the click site, so both callers share one path in and one path out.
 * The dialog's own `close` event is what reports closing upward, which means
 * Escape and a backdrop click travel the same route as the Close button
 * instead of leaving the parent's state out of step with the DOM.
 */
export function PhotoViewer({ photos, index, onClose, onIndexChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = index === null ? undefined : photos[index];
  const open = photo !== undefined;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next < 0 || next >= photos.length) return;
      onIndexChange(next);
    },
    [index, photos.length, onIndexChange],
  );

  // Arrow keys page through the set. A lightbox with Previous and Next buttons
  // that ignores the arrow keys is a gap people notice immediately.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    },
    [step],
  );

  return (
    <dialog
      ref={dialogRef}
      className="photo-viewer"
      onClose={onClose}
      onKeyDown={onKeyDown}
      aria-label="Progress photo"
    >
      {photo && (
        <div className="photo-viewer-inner">
          <div className="photo-viewer-header">
            <p className="label-caps">
              {formatWithWeekday(photo.date)}
              {photo.dayNumber !== undefined && ` · Day ${photo.dayNumber}`} ·{" "}
              {SLOT_LABELS[photo.slot]}
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>

          {/* next/image is not usable here: its optimizer fetches the source
              itself and has no session, so an authenticated route always 404s
              for it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${photo.id}${photo.version ? `?v=${photo.version}` : ""}`}
            alt={`${SLOT_LABELS[photo.slot]} progress photo, ${formatWithWeekday(photo.date)}`}
            className="photo-viewer-image"
          />

          <div className="photo-viewer-actions">
            {photos.length > 1 ? (
              <div className="photo-viewer-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(-1)}
                  disabled={index === 0}
                >
                  Previous
                </button>
                <span className="label-caps">
                  {(index ?? 0) + 1} of {photos.length}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(1)}
                  disabled={index === photos.length - 1}
                >
                  Next
                </button>
              </div>
            ) : (
              <span />
            )}

            {/* A plain link, not fetch-and-blob: the browser handles the save
                and the filename comes from the server's Content-Disposition,
                which is also what makes this work when the download attribute
                is ignored. */}
            <a
              className="btn btn-secondary btn-sm"
              href={`/api/photos/${photo.id}?download=1`}
              download
            >
              Download
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}
