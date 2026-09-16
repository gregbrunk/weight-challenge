/**
 * The guards on writing a fast time.
 *
 * These are the only thing between a mistyped time and a fast that reads as
 * forty hours long, or as negative. They matter more than most validation in
 * this app because a fast is assembled from two rows written a day apart — the
 * mistake isn't visible on the screen where it's made.
 *
 * The database, auth and clock are mocked; everything about the rules
 * themselves is the real module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(async () => undefined) }));
vi.mock("@/lib/timezone-server", () => ({
  getTimeZone: vi.fn(async () => "America/Denver"),
}));

const saveEntryFields =
  vi.fn<(planId: string, date: string, fields: unknown) => Promise<unknown>>();
const savePreStartFast = vi.fn<(planId: string, at: Date | null) => Promise<void>>();
const getEntry = vi.fn<(planId: string, date: string) => Promise<unknown>>();
const getActivePlan = vi.fn<() => Promise<unknown>>();

// The spies are referenced through thin wrappers: `vi.mock` is hoisted above
// the declarations above, so naming them directly in the factory would read
// them before they exist.
vi.mock("@/lib/plans", async () => {
  const actual = await vi.importActual<typeof import("@/lib/plans")>("@/lib/plans");
  return {
    ...actual,
    getActivePlan: () => getActivePlan(),
    getEntry: (planId: string, date: string) => getEntry(planId, date),
    saveEntryFields: (planId: string, date: string, fields: unknown) =>
      saveEntryFields(planId, date, fields),
    savePreStartFast: (planId: string, at: Date | null) => savePreStartFast(planId, at),
  };
});

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { saveFastTimeAction } = await import("./fasting");

/** An 18:6 plan running through September. */
const plan = {
  id: "plan1",
  startDate: new Date("2026-09-01T00:00:00Z"),
  days: 30,
  rmr: 1980,
  targetActiveCals: 1200,
  lbsToLose: 12,
  calsPerLb: 3500,
  startWeight: 232.6,
  startBodyFat: null,
  startVo2Max: null,
  startSystolic: null,
  startDiastolic: null,
  fastingPlan: "fast18_6",
  preStartFastAt: null,
};

/** 6:30 PM Mountain on the 15th. */
const START_15TH = new Date("2026-09-16T00:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  getActivePlan.mockResolvedValue(plan);
  getEntry.mockResolvedValue(null);
});

describe("ending a fast", () => {
  it("refuses when no fast was started the day before", async () => {
    // Nothing on the 15th to pair the 16th's end with.
    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "end",
      value: "12:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "No fast was started the day before, so there's nothing to end.",
    });
    expect(saveEntryFields).not.toHaveBeenCalled();
  });

  it("accepts an end in the small hours, which is still after the evening before", async () => {
    getEntry.mockResolvedValue({ fastStartAt: START_15TH });

    // 12:15 AM on the 16th follows a 6:30 PM start on the 15th by six hours.
    // Worth pinning down: it looks like an earlier time and is not one.
    await expect(
      saveFastTimeAction({ date: "2026-09-16", edge: "end", value: "00:15" }),
    ).resolves.toEqual({ ok: true, value: "00:15" });
  });

  it("refuses a time genuinely before the fast began", async () => {
    // A start at noon on the 16th, ended at 6 AM the same day.
    getEntry.mockResolvedValue({ fastStartAt: new Date("2026-09-16T18:00:00Z") });

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "end",
      value: "06:00",
    });

    expect(result).toEqual({
      ok: false,
      error: "That's before the fast started — check the time.",
    });
  });

  it("refuses a fast longer than two days", async () => {
    // A start four days earlier is the realistic version of this mistake: an
    // end time typed against the wrong day.
    getEntry.mockResolvedValue({ fastStartAt: new Date("2026-09-12T00:30:00Z") });

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "end",
      value: "12:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "That would be a fast of over 48 hours — check the time.",
    });
  });

  it("stores the instant the wall-clock time names, and hands it back", async () => {
    getEntry.mockResolvedValue({ fastStartAt: START_15TH });

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "end",
      value: "12:30",
    });

    expect(result).toEqual({ ok: true, value: "12:30" });
    // 12:30 Mountain on the 16th is 18:30 UTC — the eighteen-hour mark.
    expect(saveEntryFields).toHaveBeenCalledWith("plan1", "2026-09-16", {
      fastEndAt: new Date("2026-09-16T18:30:00Z"),
    });
  });
});

describe("starting a fast", () => {
  it("stores a time with nothing to check it against", async () => {
    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "start",
      value: "18:30",
    });

    expect(result).toEqual({ ok: true, value: "18:30" });
    expect(saveEntryFields).toHaveBeenCalledWith("plan1", "2026-09-16", {
      fastStartAt: new Date("2026-09-17T00:30:00Z"),
    });
  });

  it("refuses a start later than an end already logged for the next day", async () => {
    // Correcting an earlier mistake must not invert the pair.
    getEntry.mockResolvedValue({ fastEndAt: new Date("2026-09-17T00:00:00Z") });

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "start",
      value: "23:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "That's after the fast was ended the next day — check the time.",
    });
  });
});

describe("clearing and refusing", () => {
  it("clears a time without any of the pairing checks", async () => {
    const result = await saveFastTimeAction({ date: "2026-09-16", edge: "end", value: "" });

    expect(result).toEqual({ ok: true, value: "" });
    expect(saveEntryFields).toHaveBeenCalledWith("plan1", "2026-09-16", {
      fastEndAt: null,
    });
  });

  it("refuses a date outside the plan", async () => {
    const result = await saveFastTimeAction({
      date: "2026-10-05",
      edge: "start",
      value: "18:30",
    });

    expect(result).toEqual({ ok: false, error: "That date is outside this plan." });
  });

  it("refuses when the plan isn't fasting at all", async () => {
    getActivePlan.mockResolvedValue({ ...plan, fastingPlan: null });

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "start",
      value: "18:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "This plan isn't tracking intermittent fasting.",
    });
  });

  it("refuses a time that isn't one", async () => {
    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "start",
      value: "half six",
    });

    expect(result).toEqual({ ok: false, error: "Enter a time like 6:30 PM." });
  });

  it("refuses 'now' when the day being edited is not today", async () => {
    vi.setSystemTime(new Date("2026-09-20T18:00:00Z"));

    const result = await saveFastTimeAction({
      date: "2026-09-16",
      edge: "start",
      value: "now",
    });

    expect(result).toEqual({
      ok: false,
      error: "It isn't that day any more — type the time instead.",
    });

    vi.useRealTimers();
  });
});


describe("the evening before the plan", () => {
  it("stores it on the plan, against the day before day one", () => {
    // The plan starts 1 September, so 6:30 PM means 6:30 PM on 31 August —
    // a day that has no entry, which is the whole reason it lives on the plan.
    return saveFastTimeAction({
      date: "2026-09-01",
      edge: "preStart",
      value: "18:30",
    }).then((result) => {
      expect(result).toEqual({ ok: true, value: "18:30" });
      expect(savePreStartFast).toHaveBeenCalledWith(
        "plan1",
        new Date("2026-09-01T00:30:00Z"),
      );
      expect(saveEntryFields).not.toHaveBeenCalled();
    });
  });

  it("clears it without touching any entry", async () => {
    const result = await saveFastTimeAction({
      date: "2026-09-01",
      edge: "preStart",
      value: "",
    });

    expect(result).toEqual({ ok: true, value: "" });
    expect(savePreStartFast).toHaveBeenCalledWith("plan1", null);
  });

  it("refuses to be edited from any day but the first", async () => {
    const result = await saveFastTimeAction({
      date: "2026-09-05",
      edge: "preStart",
      value: "18:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "That time belongs to the plan's first day.",
    });
    expect(savePreStartFast).not.toHaveBeenCalled();
  });

  it("refuses a time later than day one's first meal", async () => {
    // Correcting it must not invert the pair it already has.
    getEntry.mockResolvedValue({ fastEndAt: new Date("2026-09-01T00:00:00Z") });

    const result = await saveFastTimeAction({
      date: "2026-09-01",
      edge: "preStart",
      value: "23:30",
    });

    expect(result).toEqual({
      ok: false,
      error: "That's after the fast was ended the next day — check the time.",
    });
  });

  it("tells you day one has no start yet, in its own words", async () => {
    // Plainly different from "no fast was started the day before", because the
    // fix is different: there is no previous day to go and edit.
    const result = await saveFastTimeAction({
      date: "2026-09-01",
      edge: "end",
      value: "12:30",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Nothing was logged for the evening before the plan started, so there's nothing to end.",
    });
  });

  it("accepts day one's first meal once that evening is on the plan", async () => {
    getActivePlan.mockResolvedValue({
      ...plan,
      preStartFastAt: new Date("2026-09-01T00:30:00Z"),
    });

    const result = await saveFastTimeAction({
      date: "2026-09-01",
      edge: "end",
      value: "12:30",
    });

    expect(result).toEqual({ ok: true, value: "12:30" });
    expect(saveEntryFields).toHaveBeenCalledWith("plan1", "2026-09-01", {
      fastEndAt: new Date("2026-09-01T18:30:00Z"),
    });
  });
});
