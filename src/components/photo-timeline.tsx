"use client";

import { useCallback, useState } from "react";
import { SLOT_LABELS, type PhotoSummary } from "@/lib/photos/slots";
import { formatShort, formatWithWeekday, type PlainDate } from "@/lib/date";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";

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
 *
 * Paging inside the viewer stays within the day you opened, so Previous and
 * Next move between that day's angles rather than wandering off into another
 * date's photos.
 */
export function PhotoTimeline({ days }: { days: TimelineDay[] }) {
  const [viewing, setViewing] = useState<{ day: TimelineDay; index: number } | null>(
    null,
  );

  const open = useCallback((day: TimelineDay, index: number) => {
    setViewing({ day, index });
  }, []);

  const close = useCallback(() => setViewing(null), []);

  const onIndexChange = useCallback(
    (index: number) => setViewing((current) => (current ? { ...current, index } : current)),
    [],
  );

  const viewable: ViewerPhoto[] =
    viewing?.day.photos.map((photo) => ({
      id: photo.id,
      slot: photo.slot,
      date: viewing.day.date,
      dayNumber: viewing.day.dayNumber,
    })) ?? [];

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
                  aria-label={`View ${SLOT_LABELS[photo.slot]} photo from ${formatWithWeekday(day.date)} full size`}
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

      <PhotoViewer
        photos={viewable}
        index={viewing?.index ?? null}
        onClose={close}
        onIndexChange={onIndexChange}
      />
    </>
  );
}
