/**
 * Input validation.
 *
 * Forms post strings, and every one of them has to be checked before it reaches
 * the database. The bounds here are sanity limits, not medical advice — they
 * exist to catch a fat-fingered 2320 instead of 232.0, not to tell anyone what
 * their plan should look like.
 */

import { z } from "zod";
import { isPlainDate } from "./date";

/**
 * Blank inputs mean "not recorded", not zero.
 *
 * Also coerces, which `z.coerce.number()` does for the required fields but
 * which a bare `z.number()` behind `preprocess` does not — form data arrives as
 * strings either way. A value that won't parse is passed through untouched so
 * Zod reports "expected number" rather than silently yielding NaN.
 */
const blankToNumberOrNull = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

function optionalNumber(schema: z.ZodNumber) {
  return z.preprocess(blankToNumberOrNull, schema.nullable());
}

const plainDate = z
  .string()
  .refine(isPlainDate, "Enter a valid date.");

export const planFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the plan a name.")
    .max(60, "Keep the name under 60 characters."),

  startDate: plainDate,

  days: z.coerce
    .number()
    .int("Length must be a whole number of days.")
    .min(1, "A plan needs at least one day.")
    .max(730, "Keep a plan under two years."),

  rmr: z.coerce
    .number()
    .int("Enter RMR as a whole number.")
    .min(800, "That RMR looks too low — check the number.")
    .max(5000, "That RMR looks too high — check the number."),

  targetActiveCals: z.coerce
    .number()
    .int("Enter active calories as a whole number.")
    .min(0, "Active calories can't be negative.")
    .max(10000, "That exercise target looks too high — check the number."),

  lbsToLose: z.coerce
    .number()
    .min(0.1, "Set a goal of at least a tenth of a pound.")
    .max(500, "That goal looks too high — check the number."),

  calsPerLb: z.coerce
    .number()
    .int()
    .min(1000, "Calories per pound looks too low — 3500 is the convention.")
    .max(10000, "Calories per pound looks too high — 3500 is the convention."),

  startWeight: optionalNumber(
    z.number().min(50, "That weight looks too low.").max(1000, "That weight looks too high."),
  ),

  /** Posted as a percentage (29.9) and stored as a fraction (0.299). */
  startBodyFat: optionalNumber(
    z.number().min(1, "Body fat looks too low.").max(75, "Body fat looks too high."),
  ),

  startVo2Max: optionalNumber(
    z.number().min(5, "VO2 max looks too low.").max(100, "VO2 max looks too high."),
  ),

  startSystolic: optionalNumber(
    z.number().int().min(50, "Systolic looks too low.").max(300, "Systolic looks too high."),
  ),

  startDiastolic: optionalNumber(
    z.number().int().min(30, "Diastolic looks too low.").max(200, "Diastolic looks too high."),
  ),
});

export type PlanFieldsSubmission = z.infer<typeof planFieldsSchema>;

/** Percent in the form, fraction in the database. */
export function percentToFraction(percent: number | null): number | null {
  return percent === null ? null : percent / 100;
}

export function fractionToPercent(fraction: number | null): number | null {
  return fraction === null ? null : fraction * 100;
}

/** The measurements a day can hold, in the order they appear on the Log screen. */
export const ENTRY_FIELDS = [
  "weight",
  "bodyFat",
  "vo2Max",
  "systolic",
  "diastolic",
  "consumedCals",
  "activeCals",
] as const;

export type EntryFieldName = (typeof ENTRY_FIELDS)[number];

export function isEntryFieldName(value: unknown): value is EntryFieldName {
  return (
    typeof value === "string" && (ENTRY_FIELDS as readonly string[]).includes(value)
  );
}

export const entryFieldsSchema = z.object({
  weight: optionalNumber(
    z
      .number()
      .min(50, "That weight looks too low — check the number.")
      .max(1000, "That weight looks too high — check the number."),
  ),
  bodyFat: optionalNumber(
    z
      .number()
      .min(1, "Body fat looks too low — check the number.")
      .max(75, "Body fat looks too high — check the number."),
  ),
  vo2Max: optionalNumber(
    z
      .number()
      .min(5, "VO2 max looks too low — check the number.")
      .max(100, "VO2 max looks too high — check the number."),
  ),
  systolic: optionalNumber(
    z
      .number()
      .int("Enter systolic as a whole number.")
      .min(50, "Systolic looks too low — check the number.")
      .max(300, "Systolic looks too high — check the number."),
  ),
  diastolic: optionalNumber(
    z
      .number()
      .int("Enter diastolic as a whole number.")
      .min(30, "Diastolic looks too low — check the number.")
      .max(200, "Diastolic looks too high — check the number."),
  ),
  consumedCals: optionalNumber(
    z
      .number()
      .int("Enter calories as a whole number.")
      .min(0, "Calories can't be negative.")
      .max(30000, "That calorie count looks too high — check the number."),
  ),
  activeCals: optionalNumber(
    z
      .number()
      .int("Enter calories as a whole number.")
      .min(0, "Calories can't be negative.")
      .max(30000, "That calorie count looks too high — check the number."),
  ),
});

/**
 * Validates one field on its own.
 *
 * The Log screen saves field by field as you fill them in, so it needs to check
 * a single value without a complete day to hand — you might only have a weight
 * at seven in the morning.
 */
export function parseEntryField(
  field: EntryFieldName,
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const result = entryFieldsSchema.shape[field].safeParse(raw);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "That doesn't look right." };
  }

  return { ok: true, value: result.data as number | null };
}

/**
 * Collapses a Zod error into one message per field, which is all a form row has
 * space to show.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in result)) result[key] = issue.message;
  }

  return result;
}
