"use client";

import { useId, useRef, useState } from "react";
import type { PhotoSlot as SlotName } from "@/generated/prisma/client";
import { deletePhotoAction, uploadPhotoAction } from "@/actions/photo";
import { ImageDecodeError, resizeImage } from "@/lib/image-resize";
import type { PlainDate } from "@/lib/date";

interface Props {
  date: PlainDate;
  slot: SlotName;
  label: string;
  /** Existing photo id, if this slot is already filled. */
  photoId: string | null;
}

type State =
  | { status: "empty" }
  | { status: "filled"; id: string }
  | { status: "working"; message: string }
  | { status: "error"; message: string; id: string | null };

/**
 * One progress photo slot.
 *
 * Optional by design — photos are a nice-to-have on any given day, so an empty
 * slot is a normal resting state and never nags. Uploading replaces whatever
 * was there, which is what you want when the first attempt came out blurry.
 *
 * The image is downsized in the browser before it is sent, so the original
 * never leaves the device and the upload finishes quickly on a phone.
 */
export function PhotoSlot({ date, slot, label, photoId }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(
    photoId ? { status: "filled", id: photoId } : { status: "empty" },
  );
  // Changes on every successful upload so the <img> refetches rather than
  // showing the replaced photo from cache.
  const [version, setVersion] = useState(0);

  const currentId =
    state.status === "filled" ? state.id : state.status === "error" ? state.id : null;

  async function handleFile(file: File) {
    setState({ status: "working", message: "Preparing…" });

    try {
      const resized = await resizeImage(file);

      setState({ status: "working", message: "Uploading…" });

      const formData = new FormData();
      formData.append("date", date);
      formData.append("slot", slot);
      formData.append("width", String(resized.width));
      formData.append("height", String(resized.height));
      formData.append("file", resized.blob, `${slot}.jpg`);

      const result = await uploadPhotoAction(formData);

      if (result.ok) {
        setState({ status: "filled", id: result.photo.id });
        setVersion((current) => current + 1);
      } else {
        setState({ status: "error", message: result.error, id: currentId });
      }
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof ImageDecodeError
            ? error.message
            : "Something went wrong adding that photo.",
        id: currentId,
      });
    } finally {
      // Lets the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!currentId) return;

    setState({ status: "working", message: "Removing…" });
    const result = await deletePhotoAction(currentId);

    setState(
      result.ok
        ? { status: "empty" }
        : { status: "error", message: result.error, id: currentId },
    );
  }

  const busy = state.status === "working";

  return (
    <div className="photo-slot">
      <div className="photo-frame">
        {currentId ? (
          /* next/image is not usable here: its optimizer fetches the source
             itself and has no session, so an authenticated route always 404s
             for it. The image is already downsized to 1600px on the client. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${currentId}?v=${version}`}
            alt={`${label} progress photo`}
            className="photo-image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="photo-placeholder" aria-hidden="true">
            +
          </span>
        )}

        {busy && (
          <span className="photo-overlay" role="status">
            {state.message}
          </span>
        )}
      </div>

      <p className="label-caps photo-label">{label}</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        disabled={busy}
      />

      <div className="photo-actions">
        <label
          htmlFor={inputId}
          className="btn btn-secondary btn-sm photo-choose"
          aria-disabled={busy || undefined}
        >
          {currentId ? "Replace" : "Add"}
        </label>

        {currentId && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>

      {state.status === "error" && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
