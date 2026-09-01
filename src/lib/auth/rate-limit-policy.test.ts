import { describe, expect, it } from "vitest";
import {
  ATTEMPT_WINDOW_SECONDS,
  BASE_LOCK_SECONDS,
  describeWait,
  FREE_ATTEMPTS,
  lockSecondsFor,
  MAX_LOCK_SECONDS,
  secondsRemaining,
  windowHasExpired,
} from "./rate-limit-policy";

describe("lockSecondsFor", () => {
  /**
   * Typos are the common case by a wide margin — this is a password typed on a
   * phone twice a day — so the first few cost nothing at all.
   */
  it.each([0, 1, 2, 3, 4, FREE_ATTEMPTS])("does not lock after %i failures", (n) => {
    expect(lockSecondsFor(n)).toBe(0);
  });

  it("starts locking on the attempt after the free ones", () => {
    expect(lockSecondsFor(FREE_ATTEMPTS + 1)).toBe(BASE_LOCK_SECONDS);
  });

  it("doubles with each further failure", () => {
    expect(lockSecondsFor(FREE_ATTEMPTS + 2)).toBe(BASE_LOCK_SECONDS * 2);
    expect(lockSecondsFor(FREE_ATTEMPTS + 3)).toBe(BASE_LOCK_SECONDS * 4);
    expect(lockSecondsFor(FREE_ATTEMPTS + 4)).toBe(BASE_LOCK_SECONDS * 8);
  });

  it("stops doubling at the ceiling", () => {
    expect(lockSecondsFor(FREE_ATTEMPTS + 20)).toBe(MAX_LOCK_SECONDS);
    expect(lockSecondsFor(1000)).toBe(MAX_LOCK_SECONDS);
  });

  /**
   * 2 ** 1024 is Infinity, and Infinity * BASE would sail past Math.min as
   * Infinity rather than clamping — a lockout with no end, from a number an
   * attacker chooses by simply continuing.
   */
  it("clamps rather than overflowing at absurd counts", () => {
    for (const n of [100, 1_000, 10_000, Number.MAX_SAFE_INTEGER]) {
      const seconds = lockSecondsFor(n);
      expect(Number.isFinite(seconds)).toBe(true);
      expect(seconds).toBe(MAX_LOCK_SECONDS);
    }
  });

  /**
   * The whole point, in one assertion: an attacker who keeps guessing is down
   * to roughly a day per 24 tries, against a search space that needs billions.
   */
  it("makes sustained guessing hopeless", () => {
    const perDay = (24 * 60 * 60) / lockSecondsFor(FREE_ATTEMPTS + 10);
    expect(perDay).toBeLessThan(30);
  });
});

describe("windowHasExpired", () => {
  const start = new Date("2026-08-28T12:00:00Z");
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  it("keeps a run alive inside the window", () => {
    expect(windowHasExpired(start, at(ATTEMPT_WINDOW_SECONDS - 1))).toBe(false);
  });

  it("forgives a run that has gone quiet", () => {
    expect(windowHasExpired(start, at(ATTEMPT_WINDOW_SECONDS + 1))).toBe(true);
  });

  /**
   * Measured from the FIRST failure, not the last. Measuring from the last
   * would let an attacker hold a run open indefinitely by pacing guesses just
   * inside the window, which is the opposite of what the window is for.
   */
  it("ages out on the first failure even if guesses keep coming", () => {
    const paced = at(ATTEMPT_WINDOW_SECONDS * 5);
    expect(windowHasExpired(start, paced)).toBe(true);
  });
});

describe("secondsRemaining", () => {
  const now = new Date("2026-08-28T12:00:00Z");

  it("is zero when nothing is locked", () => {
    expect(secondsRemaining(null, now)).toBe(0);
  });

  it("is zero once the lock has passed", () => {
    expect(secondsRemaining(new Date(now.getTime() - 1000), now)).toBe(0);
  });

  it("rounds up, so it never says zero while still locked", () => {
    expect(secondsRemaining(new Date(now.getTime() + 100), now)).toBe(1);
  });

  it("counts whole seconds left", () => {
    expect(secondsRemaining(new Date(now.getTime() + 90_000), now)).toBe(90);
  });
});

describe("describeWait", () => {
  it.each([
    [0, "in a moment"],
    [1, "in a moment"],
    [30, "in 30 seconds"],
    [59, "in 59 seconds"],
    [60, "in 1 minute"],
    [90, "in 2 minutes"],
    [3599, "in 60 minutes"],
    // The cap is one hour, so this is the longest wait the app can ever name.
    [3600, "in 1 hour"],
    [7200, "in 2 hours"],
  ])("describes %i seconds as %s", (seconds, expected) => {
    expect(describeWait(seconds)).toBe(expected);
  });

  /**
   * Rounding up from the unit below compounds. 3601 seconds is a minute over
   * an hour; via "61 minutes" it would be announced as two hours, and the
   * message would hold someone out for an hour longer than the lock does.
   */
  it("does not compound its rounding", () => {
    expect(describeWait(MAX_LOCK_SECONDS + 1)).toBe("in 2 hours");
    expect(describeWait(3600 * 2)).toBe("in 2 hours");
  });

  it("never says a bare zero or a negative", () => {
    for (const seconds of [-10, 0, 1]) {
      expect(describeWait(seconds)).not.toMatch(/-|\b0\b/);
    }
  });
});
