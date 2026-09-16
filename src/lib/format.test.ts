/**
 * Duration formatting for the fasting timer.
 *
 * Both of these sit next to a met-or-missed verdict, so rounding that
 * disagrees with the verdict is the failure mode worth guarding against.
 */

import { describe, expect, it } from "vitest";
import { EM_DASH, formatClock, formatDuration } from "./format";

describe("formatDuration", () => {
  it("reads a finished fast in hours and minutes", () => {
    expect(formatDuration(16 + 26 / 60)).toBe("16h 26m");
    expect(formatDuration(18)).toBe("18h 0m");
  });

  it("rounds to the nearest minute rather than truncating", () => {
    // Two seconds short of 17h must not read as 16h 59m next to a met goal.
    expect(formatDuration(17 - 2 / 3600)).toBe("17h 0m");
  });

  it("is an em dash with nothing to show", () => {
    expect(formatDuration(null)).toBe(EM_DASH);
    expect(formatDuration(undefined)).toBe(EM_DASH);
    expect(formatDuration(Number.NaN)).toBe(EM_DASH);
  });
});

describe("formatClock", () => {
  it("counts hours, minutes and seconds", () => {
    expect(formatClock(((8 * 60 + 30) * 60 + 1) * 1000)).toBe("8:30:01");
    expect(formatClock(0)).toBe("0:00:00");
  });

  it("keeps counting past a day rather than wrapping to zero", () => {
    expect(formatClock(25 * 3_600_000)).toBe("25:00:00");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5000)).toBe("0:00:00");
  });
});
