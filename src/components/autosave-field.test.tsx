// @vitest-environment happy-dom

/**
 * Covers the bug where arrowing back a day on the Log screen showed the
 * previous day's numbers.
 *
 * Every field seeds its state from props. Navigating dates re-renders with new
 * props but React keeps the same component instance, so `useState` — which only
 * reads its argument on mount — held yesterday's value on today's screen, or
 * the reverse. Nothing about it looked wrong: the values were real, just for
 * the wrong day.
 */

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/entry", () => ({
  saveEntryFieldAction: vi.fn(async () => ({ ok: true })),
}));

const { AutosaveField } = await import("./autosave-field");

afterEach(cleanup);

const field = (date: string, value: string) => (
  <AutosaveField
    date={date as never}
    field="weight"
    label="Weight"
    initialValue={value}
    unit="lb"
    step="0.1"
    decimal
  />
);

describe("AutosaveField", () => {
  it("shows the value it was given", () => {
    render(field("2026-08-26", "234.5"));
    expect(screen.getByLabelText("Weight")).toHaveProperty("value", "234.5");
  });

  it("adopts the new day's value when re-rendered for a different date", () => {
    // This is the regression. Same component instance, different date.
    const { rerender } = render(field("2026-08-26", "234.5"));
    expect(screen.getByLabelText("Weight")).toHaveProperty("value", "234.5");

    rerender(field("2026-08-25", "232.6"));
    expect(screen.getByLabelText("Weight")).toHaveProperty("value", "232.6");
  });

  it("shows an empty field for a day with nothing logged", () => {
    const { rerender } = render(field("2026-08-26", "234.5"));
    rerender(field("2026-08-24", ""));

    // An unlogged day must read blank, not carry the last day's number.
    expect(screen.getByLabelText("Weight")).toHaveProperty("value", "");
  });

  it("keeps what you typed while the date stays the same", () => {
    // Re-rendering for the same day must not discard an in-progress edit.
    const { rerender } = render(field("2026-08-26", "234.5"));
    // fireEvent, not input.value — assigning directly bypasses React's value
    // tracker and the controlled input simply reverts.
    fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "235.1" } });

    rerender(field("2026-08-26", "234.5"));
    expect(screen.getByLabelText("Weight")).toHaveProperty("value", "235.1");
  });
});
