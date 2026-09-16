// @vitest-environment happy-dom

/**
 * The timer's states, which are the part of this feature most easily got wrong
 * without anyone noticing.
 *
 * A ring is hard to read from a test, so every state is also asserted through
 * the accessible label on the ring and the text inside it — which is what a
 * screen reader gets, and what a glance at the screen is meant to convey.
 *
 * The cases that matter: a fast still open on a *past* day was never ended and
 * is a miss, not a timer that should still be running; and a fast past its goal
 * keeps counting rather than sitting at zero.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FastTimer, type FastTimerProps } from "./fast-timer";

afterEach(cleanup);

const START = Date.parse("2026-09-15T00:30:00Z");
const HOUR = 3_600_000;

function props(overrides: Partial<FastTimerProps> = {}): FastTimerProps {
  return {
    status: "running",
    startAtMs: START,
    endAtMs: null,
    goalHours: 18,
    met: false,
    nowMs: START + 8.5 * HOUR,
    isToday: true,
    startedLabel: "Day before, 6:30 PM",
    goalEndLabel: "12:30 PM",
    endedLabel: null,
    creditable: true,
    ...overrides,
  };
}

describe("a fast in progress", () => {
  it("counts up by default, and shows what is left", () => {
    render(<FastTimer {...props()} />);

    expect(screen.getByText("Elapsed (47%)")).toBeTruthy();
    expect(screen.getByText("8:30:00")).toBeTruthy();
    expect(screen.getByText("Remaining 9:30:00")).toBeTruthy();
  });

  it("shows the same fast from the other end when switched to count down", () => {
    render(<FastTimer {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Count down" }));

    expect(screen.getByText("Remaining (53%)")).toBeTruthy();
    expect(screen.getByText("9:30:00")).toBeTruthy();
    // The elapsed figure is still there, just demoted to the caption.
    expect(screen.getByText("Elapsed 8:30:00")).toBeTruthy();
  });

  it("names the start and the time the goal will be reached", () => {
    render(<FastTimer {...props()} />);

    expect(screen.getByText("Day before, 6:30 PM")).toBeTruthy();
    expect(screen.getByText("12:30 PM")).toBeTruthy();
  });

  it("keeps counting past the goal rather than resting at zero", () => {
    render(<FastTimer {...props({ nowMs: START + 19.5 * HOUR })} />);

    expect(screen.getByText("Past your goal")).toBeTruthy();
    expect(screen.getByText("+1:30:00")).toBeTruthy();
    // With nothing left to count down, the toggle has nothing to offer.
    expect(screen.queryByRole("button", { name: "Count down" })).toBeNull();
  });
});

describe("a fast that has been closed", () => {
  it("shows a tick and the duration when the goal was reached", () => {
    render(
      <FastTimer
        {...props({
          status: "complete",
          endAtMs: START + 18.5 * HOUR,
          met: true,
          endedLabel: "1:00 PM",
        })}
      />,
    );

    expect(screen.getByText("18h 30m")).toBeTruthy();
    expect(screen.getByText("Goal was 18h")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Fast complete: 18h 30m" }),
    ).toBeTruthy();
    expect(document.querySelector('.fast-timer-verdict[data-tone="success"]')).toBeTruthy();
  });

  it("shows a cross and the duration when it fell short", () => {
    render(
      <FastTimer
        {...props({
          status: "complete",
          endAtMs: START + 15 * HOUR,
          met: false,
          endedLabel: "9:30 AM",
        })}
      />,
    );

    expect(screen.getByText("15h 0m")).toBeTruthy();
    expect(screen.getByText("18h goal missed")).toBeTruthy();
    expect(document.querySelector('.fast-timer-verdict[data-tone="danger"]')).toBeTruthy();
  });

  it("stops offering the count-up toggle once there is a verdict", () => {
    render(
      <FastTimer {...props({ status: "complete", endAtMs: START + 18 * HOUR, met: true })} />,
    );

    expect(screen.queryByRole("button", { name: "Count up" })).toBeNull();
  });
});

describe("a fast left open on a past day", () => {
  it("reads as never ended rather than as a timer still running", () => {
    render(<FastTimer {...props({ isToday: false, nowMs: START + 40 * HOUR })} />);

    expect(screen.getByText("Not ended")).toBeTruthy();
    expect(screen.getByText("No first meal was logged that day")).toBeTruthy();
    // Emphatically not "40:00:00".
    expect(screen.queryByText("40:00:00")).toBeNull();
    expect(document.querySelector('.fast-timer-verdict[data-tone="danger"]')).toBeTruthy();
  });
});

describe("a day with no fast to end", () => {
  it("explains what to do on today", () => {
    render(<FastTimer {...props({ status: "none", startAtMs: null })} />);

    expect(screen.getByText("No fast to end today")).toBeTruthy();
    expect(
      screen.getByText("Log last night's last meal and this ring starts counting."),
    ).toBeTruthy();
  });

  it("explains what happened on a past day", () => {
    render(<FastTimer {...props({ status: "none", startAtMs: null, isToday: false })} />);

    expect(
      screen.getByText("Nothing was started the day before, so no fast was credited here."),
    ).toBeTruthy();
  });

  it("says so on the plan's first day, which can never be credited one", () => {
    // Day one's fast would have had to begin before the plan existed, so this
    // ring will never count however diligently tonight's meal is logged.
    render(<FastTimer {...props({ status: "none", startAtMs: null, creditable: false })} />);

    expect(screen.getByText("The plan's first day")).toBeTruthy();
    expect(
      screen.getByText(
        "A fast credited here would have begun before the plan did. Log tonight's last meal and the first one lands tomorrow.",
      ),
    ).toBeTruthy();
  });
});
