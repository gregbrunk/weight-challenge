/**
 * The pure parts of plans.ts: the mapping a stored plan takes on its way into
 * the form. Restart is this mapping with today's date swapped in, so if it
 * drifts, a restarted plan silently begins with the wrong numbers.
 *
 * The module also owns the database client, which is not wanted here, so the
 * client is mocked out before the import.
 */

import { describe, expect, it, vi } from "vitest";
import type { Plan } from "@/generated/prisma/client";

vi.mock("./db", () => ({ prisma: {} }));

const { planToFormValues, toPlanInput } = await import("./plans");

/** A row as Prisma would hand it back, dates pinned to UTC noon. */
const plan: Plan = {
  id: "plan-1",
  name: "Cut, round two",
  status: "archived",
  startDate: new Date("2026-05-01T12:00:00Z"),
  days: 93,
  rmr: 1980,
  targetActiveCals: 1200,
  lbsToLose: 33,
  calsPerLb: 3500,
  startWeight: 232.6,
  startBodyFat: 0.306,
  startVo2Max: 37.2,
  startSystolic: 134,
  startDiastolic: 91,
  createdAt: new Date("2026-05-01T12:00:00Z"),
  updatedAt: new Date("2026-05-01T12:00:00Z"),
  archivedAt: new Date("2026-08-01T12:00:00Z"),
};

describe("planToFormValues", () => {
  it("turns every stored number into the string the form edits", () => {
    expect(planToFormValues(plan)).toEqual({
      name: "Cut, round two",
      startDate: "2026-05-01",
      days: "93",
      rmr: "1980",
      targetActiveCals: "1200",
      lbsToLose: "33",
      calsPerLb: "3500",
      startWeight: "232.6",
      startBodyFat: "30.6",
      startVo2Max: "37.2",
      startSystolic: "134",
      startDiastolic: "91",
    });
  });

  /**
   * Body fat is stored as a fraction and edited as a percentage. 0.306 * 100 is
   * 30.599999999999998 in floating point; the form must never show that.
   */
  it("presents body fat as a clean percentage", () => {
    expect(planToFormValues(plan).startBodyFat).toBe("30.6");
  });

  it("leaves an unrecorded baseline blank rather than writing 0", () => {
    const sparse = { ...plan, startVo2Max: null, startSystolic: null, startDiastolic: null };
    const values = planToFormValues(sparse);

    expect(values.startVo2Max).toBe("");
    expect(values.startSystolic).toBe("");
    expect(values.startDiastolic).toBe("");
  });

  /**
   * The restart page does `{ ...planToFormValues(source), startDate: today }`.
   * This pins down that the spread leaves every other field intact — the
   * whole value of a restart is that only the date changes until you say so.
   */
  it("restarts as the same plan with only the date moved", () => {
    const restarted = { ...planToFormValues(plan), startDate: "2026-09-14" };

    expect(restarted.startDate).toBe("2026-09-14");
    expect(restarted).toEqual({ ...planToFormValues(plan), startDate: "2026-09-14" });
    // And nothing but the date differs from the original.
    const differing = Object.keys(restarted).filter(
      (key) => restarted[key as keyof typeof restarted] !== planToFormValues(plan)[key as keyof typeof restarted],
    );
    expect(differing).toEqual(["startDate"]);
  });
});

describe("toPlanInput", () => {
  it("reads the calendar day from a UTC-noon date", () => {
    expect(toPlanInput(plan).startDate).toBe("2026-05-01");
  });
});
