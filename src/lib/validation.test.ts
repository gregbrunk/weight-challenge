/**
 * Form data always arrives as strings, including from `<input type="number">`.
 * These tests pin that down for the optional fields in particular, which is
 * where a blank value and an unparseable one have to be told apart.
 */

import { describe, expect, it } from "vitest";
import {
  ENTRY_FIELDS,
  entryFieldsSchema,
  isEntryFieldName,
  parseEntryField,
  fieldErrors,
  fractionToPercent,
  percentToFraction,
  planFieldsSchema,
} from "./validation";

/** A complete, valid submission, matching what the form posts. */
const validPlan = {
  name: "2026 Challenge",
  startDate: "2026-08-25",
  days: "93",
  rmr: "1980",
  targetActiveCals: "1200",
  lbsToLose: "33",
  calsPerLb: "3500",
  startWeight: "232.6",
  startBodyFat: "29.9",
  startVo2Max: "37.2",
  startSystolic: "",
  startDiastolic: "",
};

describe("planFieldsSchema", () => {
  it("accepts a full submission and coerces every field to a number", () => {
    const result = planFieldsSchema.safeParse(validPlan);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.days).toBe(93);
    expect(result.data.rmr).toBe(1980);
    expect(result.data.lbsToLose).toBe(33);
    // The regression: optional fields arrive as strings too, and must coerce
    // exactly like the required ones.
    expect(result.data.startWeight).toBe(232.6);
    expect(result.data.startBodyFat).toBe(29.9);
    expect(result.data.startVo2Max).toBe(37.2);
  });

  it("reads blank optional fields as not-recorded rather than zero", () => {
    const result = planFieldsSchema.safeParse(validPlan);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.startSystolic).toBeNull();
    expect(result.data.startDiastolic).toBeNull();
  });

  it("accepts a plan with no baseline measurements at all", () => {
    const result = planFieldsSchema.safeParse({
      ...validPlan,
      startWeight: "",
      startBodyFat: "",
      startVo2Max: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.startWeight).toBeNull();
  });

  it("rejects an optional field that isn't a number", () => {
    const result = planFieldsSchema.safeParse({ ...validPlan, startWeight: "heavy" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).startWeight).toBeTruthy();
  });

  it("tolerates surrounding whitespace", () => {
    const result = planFieldsSchema.safeParse({ ...validPlan, startWeight: " 232.6 " });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.startWeight).toBe(232.6);
  });

  it("requires a name", () => {
    const result = planFieldsSchema.safeParse({ ...validPlan, name: "   " });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).name).toMatch(/name/i);
  });

  it("rejects a malformed start date", () => {
    for (const bad of ["", "25/08/2026", "2026-8-5", "tomorrow"]) {
      expect(planFieldsSchema.safeParse({ ...validPlan, startDate: bad }).success).toBe(
        false,
      );
    }
  });

  it("rejects a zero-day or negative plan", () => {
    expect(planFieldsSchema.safeParse({ ...validPlan, days: "0" }).success).toBe(false);
    expect(planFieldsSchema.safeParse({ ...validPlan, days: "-5" }).success).toBe(false);
  });

  it("rejects a fractional number of days", () => {
    expect(planFieldsSchema.safeParse({ ...validPlan, days: "93.5" }).success).toBe(
      false,
    );
  });

  it("catches a decimal point slipped in the wrong place", () => {
    // 2320 lb instead of 232.0 — the exact fat-finger the bounds exist for.
    const result = planFieldsSchema.safeParse({ ...validPlan, startWeight: "2320" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).startWeight).toMatch(/too high/i);
  });

  it("reports one message per field", () => {
    const result = planFieldsSchema.safeParse({
      ...validPlan,
      name: "",
      days: "0",
      rmr: "10",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(["days", "name", "rmr"]);
  });
});

describe("entryFieldsSchema", () => {
  it("accepts a partial day, which is the normal case", () => {
    // Morning: weight and body fat only.
    const result = entryFieldsSchema.safeParse({
      weight: "231.2",
      bodyFat: "29.4",
      vo2Max: "",
      systolic: "",
      diastolic: "",
      consumedCals: "",
      activeCals: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.weight).toBe(231.2);
    expect(result.data.consumedCals).toBeNull();
  });

  it("accepts an entirely empty day", () => {
    const result = entryFieldsSchema.safeParse({
      weight: "",
      bodyFat: "",
      vo2Max: "",
      systolic: "",
      diastolic: "",
      consumedCals: "",
      activeCals: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects fractional calories and blood pressure", () => {
    expect(entryFieldsSchema.safeParse({ consumedCals: "1500.5" }).success).toBe(false);
    expect(entryFieldsSchema.safeParse({ systolic: "128.5" }).success).toBe(false);
  });
});

describe("parseEntryField", () => {
  it("parses one field without needing the rest of the day", () => {
    // Seven in the morning: a weight and nothing else.
    expect(parseEntryField("weight", "231.2")).toEqual({ ok: true, value: 231.2 });
  });

  it("reads an empty string as clearing the measurement", () => {
    expect(parseEntryField("weight", "")).toEqual({ ok: true, value: null });
    expect(parseEntryField("consumedCals", "")).toEqual({ ok: true, value: null });
  });

  it("accepts a genuine zero, which is not the same as blank", () => {
    // A rest day really can be zero active calories.
    expect(parseEntryField("activeCals", "0")).toEqual({ ok: true, value: 0 });
  });

  it("returns a readable message rather than throwing", () => {
    const result = parseEntryField("weight", "2320");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too high/i);
  });

  it("rejects text", () => {
    expect(parseEntryField("systolic", "high").ok).toBe(false);
  });

  it("handles every field the Log screen offers", () => {
    const samples: Record<string, string> = {
      weight: "225",
      bodyFat: "28.5",
      vo2Max: "36",
      systolic: "128",
      diastolic: "82",
      consumedCals: "1800",
      activeCals: "1300",
    };

    for (const field of ENTRY_FIELDS) {
      const result = parseEntryField(field, samples[field]);
      expect(result.ok, `${field} should parse`).toBe(true);
    }
  });
});

describe("isEntryFieldName", () => {
  it("accepts the real field names", () => {
    for (const field of ENTRY_FIELDS) {
      expect(isEntryFieldName(field)).toBe(true);
    }
  });

  it("rejects anything else, including attempts at other columns", () => {
    for (const bad of ["planId", "id", "note", "", "__proto__", 42, null]) {
      expect(isEntryFieldName(bad)).toBe(false);
    }
  });
});

describe("body fat conversion", () => {
  it("round-trips between the form's percent and the database's fraction", () => {
    expect(percentToFraction(29.9)).toBeCloseTo(0.299, 10);
    expect(fractionToPercent(0.299)).toBeCloseTo(29.9, 10);
    expect(fractionToPercent(percentToFraction(27.4))).toBeCloseTo(27.4, 10);
  });

  it("passes null through untouched", () => {
    expect(percentToFraction(null)).toBeNull();
    expect(fractionToPercent(null)).toBeNull();
  });
});
