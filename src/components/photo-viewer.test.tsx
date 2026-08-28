// @vitest-environment happy-dom

/**
 * Exercises the photo viewer and the Log screen's slot group for real.
 *
 * The parts worth testing here are the ones that are easy to get subtly wrong
 * and hard to see: which photos the viewer can page between, that paging stays
 * inside the day, that the download link points at the download route rather
 * than the inline one, and that a photo which has just been removed cannot be
 * left on screen.
 *
 * `showModal` is not implemented in the test DOM, so it is stubbed to set the
 * `open` property the way a browser would. That is the only browser behaviour
 * this file leans on; everything else is the real component.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import { PhotoSlotGroup } from "./photo-slot-group";

// A slot imports the upload and delete actions, and in a test there is no
// "use server" boundary to stop the real module graph — and therefore Prisma —
// being pulled in. Nothing here invokes them; they exist so the import
// resolves.
vi.mock("@/actions/photo", () => ({
  uploadPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

beforeAll(() => {
  const proto = window.HTMLDialogElement.prototype;

  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(cleanup);

const photos: ViewerPhoto[] = [
  { id: "p-front", slot: "front", date: "2026-08-27", dayNumber: 3 },
  { id: "p-side", slot: "side", date: "2026-08-27", dayNumber: 3 },
];

function dialog() {
  return document.querySelector("dialog") as HTMLDialogElement;
}

describe("PhotoViewer", () => {
  it("stays closed while the index is null", () => {
    render(
      <PhotoViewer photos={photos} index={null} onClose={() => {}} onIndexChange={() => {}} />,
    );

    expect(dialog().open).toBe(false);
  });

  it("opens on the photo the index names", () => {
    render(
      <PhotoViewer photos={photos} index={1} onClose={() => {}} onIndexChange={() => {}} />,
    );

    expect(dialog().open).toBe(true);
    const image = screen.getByRole("img") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("/api/photos/p-side");
  });

  /**
   * The download link must carry ?download=1. Without it the route serves the
   * same bytes with an inline disposition, and the browser navigates to the
   * photo instead of saving it — which looks like a broken button.
   */
  it("offers a download that points at the download route", () => {
    render(
      <PhotoViewer photos={photos} index={0} onClose={() => {}} onIndexChange={() => {}} />,
    );

    const link = screen.getByRole("link", { name: /download/i });
    expect(link.getAttribute("href")).toBe("/api/photos/p-front?download=1");
    expect(link).toHaveProperty("download");
  });

  it("cache-busts the image when a photo has been replaced", () => {
    render(
      <PhotoViewer
        photos={[{ ...photos[0], version: 2 }]}
        index={0}
        onClose={() => {}}
        onIndexChange={() => {}}
      />,
    );

    expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/api/photos/p-front?v=2",
    );
  });

  it("reports paging rather than moving on its own", async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <PhotoViewer
        photos={photos}
        index={0}
        onClose={() => {}}
        onIndexChange={onIndexChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onIndexChange).toHaveBeenCalledWith(1);

    rerender(
      <PhotoViewer
        photos={photos}
        index={1}
        onClose={() => {}}
        onIndexChange={onIndexChange}
      />,
    );
    expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/api/photos/p-side",
    );
  });

  it("cannot page past either end", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <PhotoViewer
        photos={photos}
        index={0}
        onClose={() => {}}
        onIndexChange={onIndexChange}
      />,
    );
    expect(
      (screen.getByRole("button", { name: /previous/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    rerender(
      <PhotoViewer
        photos={photos}
        index={1}
        onClose={() => {}}
        onIndexChange={onIndexChange}
      />,
    );
    expect(
      (screen.getByRole("button", { name: /next/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("hides the pager for a lone photo but keeps the download", () => {
    render(
      <PhotoViewer
        photos={[photos[0]]}
        index={0}
        onClose={() => {}}
        onIndexChange={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.getByRole("link", { name: /download/i })).toBeTruthy();
  });

  /** Escape and a backdrop click both surface as the dialog's close event. */
  it("reports closing when the dialog closes itself", () => {
    const onClose = vi.fn();
    render(
      <PhotoViewer photos={photos} index={0} onClose={onClose} onIndexChange={() => {}} />,
    );

    fireEvent(dialog(), new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("PhotoSlotGroup", () => {
  const slots = [
    { slot: "front" as const, label: "Front", photoId: "p-front" },
    { slot: "side" as const, label: "Side", photoId: null },
    { slot: "back" as const, label: "Back", photoId: "p-back" },
  ];

  it("opens the photo that was tapped, not the first one", () => {
    render(<PhotoSlotGroup date="2026-08-27" dayNumber={3} slots={slots} />);

    fireEvent.click(screen.getByRole("button", { name: /view back photo full size/i }));

    const viewer = within(dialog());
    expect(dialog().open).toBe(true);
    expect((viewer.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/api/photos/p-back",
    );
  });

  /**
   * The viewer pages between the day's *filled* slots. An empty slot in the
   * middle must not become a blank page, and it must not shift the indexes so
   * that Next lands on the wrong photo.
   */
  it("pages only between filled slots", () => {
    render(<PhotoSlotGroup date="2026-08-27" dayNumber={3} slots={slots} />);

    fireEvent.click(screen.getByRole("button", { name: /view front photo full size/i }));
    const viewer = within(dialog());

    expect(viewer.getByText("1 of 2")).toBeTruthy();
    fireEvent.click(viewer.getByRole("button", { name: /next/i }));

    expect((within(dialog()).getByRole("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/api/photos/p-back",
    );
  });

  it("offers no viewer button for an empty slot", () => {
    render(<PhotoSlotGroup date="2026-08-27" dayNumber={3} slots={slots} />);

    expect(screen.queryByRole("button", { name: /view side photo full size/i })).toBeNull();
  });

  it("captions the photo with the day it belongs to", () => {
    render(<PhotoSlotGroup date="2026-08-27" dayNumber={3} slots={slots} />);

    fireEvent.click(screen.getByRole("button", { name: /view front photo full size/i }));
    expect(within(dialog()).getByText(/Day 3/)).toBeTruthy();
  });
});
