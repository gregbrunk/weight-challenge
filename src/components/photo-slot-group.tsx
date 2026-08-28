"use client";

import { useCallback, useState } from "react";
import type { PhotoSlot as SlotName } from "@/generated/prisma/client";
import type { PlainDate } from "@/lib/date";
import { PhotoSlot } from "./photo-slot";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";

export interface SlotConfig {
  slot: SlotName;
  label: string;
  photoId: string | null;
}

interface Props {
  date: PlainDate;
  dayNumber: number;
  slots: SlotConfig[];
}

/**
 * The day's three photo slots, plus the viewer they share.
 *
 * The viewer lives here rather than inside each slot so that opening one photo
 * lets you page through the day's others — the same behaviour as the Progress
 * timeline. Three independent viewers, one per slot, would each know about a
 * single photo and Previous/Next would have nothing to move between.
 *
 * Which slots are filled changes as photos are added and removed, so each slot
 * reports its current id upward. The version counter rides along: replacing a
 * photo reuses its row and therefore its id, and without a changing URL the
 * viewer would show the file that was just replaced, straight from cache.
 *
 * Like every client component on this screen it seeds state from props, so the
 * Log page keys the day's subtree by date. Remove that key and arrowing to
 * another day shows the previous day's photos under the new date.
 */
export function PhotoSlotGroup({ date, dayNumber, slots }: Props) {
  const [ids, setIds] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(slots.map((entry) => [entry.slot, entry.photoId])),
  );
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [viewingSlot, setViewingSlot] = useState<SlotName | null>(null);

  const handleChange = useCallback((slot: SlotName, id: string | null) => {
    setIds((current) => ({ ...current, [slot]: id }));
    setVersions((current) => ({ ...current, [slot]: (current[slot] ?? 0) + 1 }));
    // A slot that has just been emptied cannot stay open in the viewer.
    setViewingSlot((current) => (current === slot && id === null ? null : current));
  }, []);

  // Only filled slots are viewable, in the order they appear on screen.
  const viewable: ViewerPhoto[] = slots.flatMap((entry) => {
    const id = ids[entry.slot];
    if (!id) return [];
    return [
      {
        id,
        slot: entry.slot,
        date,
        dayNumber,
        version: versions[entry.slot],
      },
    ];
  });

  const viewingIndex =
    viewingSlot === null
      ? null
      : (() => {
          const found = viewable.findIndex((photo) => photo.slot === viewingSlot);
          return found === -1 ? null : found;
        })();

  return (
    <>
      <div className="photo-grid">
        {slots.map((entry) => (
          <PhotoSlot
            key={entry.slot}
            date={date}
            slot={entry.slot}
            label={entry.label}
            photoId={entry.photoId}
            version={versions[entry.slot] ?? 0}
            onPhotoChange={handleChange}
            onView={setViewingSlot}
          />
        ))}
      </div>

      <PhotoViewer
        photos={viewable}
        index={viewingIndex}
        onClose={() => setViewingSlot(null)}
        onIndexChange={(next) => setViewingSlot(viewable[next]?.slot ?? null)}
      />
    </>
  );
}
