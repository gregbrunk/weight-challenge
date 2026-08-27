"use client";

import { useCallback, useRef, useState } from "react";
import { SLOT_LABELS, type PhotoSummary } from "@/lib/photos/slots";
import { formatShort, formatWithWeekday, type PlainDate } from "@/lib/date";

export interface TimelineDay {
  date: PlainDate;
  dayNumber: number;
  photos: PhotoSummary[];
}

/**
 * Progress photos across the whole plan, newest work at the right.
 *
 * A horizontal strip rather than a grid: the comparison you actually want is
 * one date against another, and a strip keeps a day's three angles together as
 * a unit. Tapping any photo opens it full size.
 */
export function PhotoTimeline({ days }: { days: TimelineDay[] }) {
  const [viewing, setViewing] = useState<{ day: TimelineDay; index: number } | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = useCallback((day: TimelineDay, index: number) => {
    setViewing({ day, index });
    // showModal gives us the focus trap, the backdrop and Escape-to-close for
    // free, which is a lot of correctness not to have to hand-roll.
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
    setViewing(null);
  }, []);

  const step = useCallback(
    (delta: number) => {
      setViewing((current) => {
        if (!current) return current;
        const next = current.index + delta;
        if (next < 0 || next >= current.day.photos.length) return current;
        return { ...current, index: next };
      });
    },
    [],
  );

  return (
    <>
      {/* tabIndex makes the overflow container reachable, so a keyboard user
          can scroll the strip with arrow keys. */}
      <div
        className="photo-timeline"
        tabIndex={0}
        role="group"
        aria-label="Progress photos by date, scrollable"
      >
        {days.map((day) => (
          <section key={day.date} className="photo-timeline-day">
            <p className="label-caps" style={{ marginBottom: "var(--space-2xs)" }}>
              {formatShort(day.date)} · Day {day.dayNumber}
            </p>

            <div className="photo-timeline-images">
              {day.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  className="photo-timeline-frame"
                  onClick={() => open(day, index)}
                  style={{ padding: 0, border: "1px solid var(--color-outline-variant)", cursor: "pointer" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${photo.id}`}
                    alt={`${SLOT_LABELS[photo.slot]}, ${formatWithWeekday(day.date)}`}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <dialog ref={dialogRef} className="photo-viewer" onClose={close}>
        {viewing && (
          <div className="photo-viewer-inner">
            <div className="photo-viewer-header">
              <p className="label-caps">
                {formatWithWeekday(viewing.day.date)} · Day {viewing.day.dayNumber} ·{" "}
                {SLOT_LABELS[viewing.day.photos[viewing.index].slot]}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
                Close
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${viewing.day.photos[viewing.index].id}`}
              alt={`${SLOT_LABELS[viewing.day.photos[viewing.index].slot]} progress photo, ${formatWithWeekday(viewing.day.date)}`}
              className="photo-viewer-image"
            />

            {viewing.day.photos.length > 1 && (
              <div className="photo-viewer-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(-1)}
                  disabled={viewing.index === 0}
                >
                  Previous
                </button>
                <span className="label-caps">
                  {viewing.index + 1} of {viewing.day.photos.length}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => step(1)}
                  disabled={viewing.index === viewing.day.photos.length - 1}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
