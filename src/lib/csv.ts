/**
 * CSV export.
 *
 * The point is that your data is never trapped in this app. The export mirrors
 * the spreadsheet this replaced: one row per logged day, the measurements as
 * entered, and the derived deficit columns alongside — so it opens in Numbers
 * or Excel and reads the way the original did.
 *
 * Every plan is included, archived ones too, because "export my data" that
 * silently omits three previous attempts is not an export.
 */

import type { EntryInput, PlanInput } from "./calc";
import { dayMetrics, planTargets } from "./calc";
import { daysBetween } from "./date";

/**
 * Escapes one field per RFC 4180.
 *
 * A value containing a comma, a quote or a newline must be quoted, and any
 * quote inside it doubled. Skipping this is how an exported note with a comma
 * silently shifts every later column by one.
 */
export function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsvRow(fields: readonly (string | number | null)[]): string {
  return fields
    .map((field) => {
      if (field === null) return "";
      return escapeCsvField(typeof field === "number" ? String(field) : field);
    })
    .join(",");
}

export const EXPORT_COLUMNS = [
  "plan",
  "plan_status",
  "date",
  "day",
  "weight_lb",
  "body_fat_pct",
  "vo2_max",
  "systolic",
  "diastolic",
  "consumed_cals",
  "active_cals",
  "daily_deficit",
  "deficit_to_plan",
] as const;

export interface ExportPlan {
  name: string;
  status: string;
  plan: PlanInput;
  entries: readonly EntryInput[];
}

/**
 * Builds the whole document, header included.
 *
 * Rounds the derived columns to two decimals: the underlying figures carry
 * floating-point noise (a deficit-to-plan of 520.3333333333303 helps nobody),
 * while the measurements are written exactly as they were entered.
 */
export function buildCsv(plans: readonly ExportPlan[]): string {
  const lines = [toCsvRow(EXPORT_COLUMNS as unknown as string[])];

  for (const { name, status, plan, entries } of plans) {
    const targets = planTargets(plan);
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    for (const entry of sorted) {
      const metrics = dayMetrics(plan, entry, targets);

      lines.push(
        toCsvRow([
          name,
          status,
          entry.date,
          daysBetween(plan.startDate, entry.date) + 1,
          entry.weight,
          // Stored as a fraction, exported as the percentage you typed.
          entry.bodyFat === null ? null : round(entry.bodyFat * 100),
          entry.vo2Max,
          entry.systolic,
          entry.diastolic,
          entry.consumedCals,
          entry.activeCals,
          metrics.dailyDeficit === null ? null : round(metrics.dailyDeficit),
          metrics.deficitToPlan === null ? null : round(metrics.deficitToPlan),
        ]),
      );
    }
  }

  // A trailing newline: POSIX tools expect a final line terminator, and some
  // spreadsheet importers drop the last row without one.
  return `${lines.join("\r\n")}\r\n`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** e.g. "weight-challenge-2026-08-25.csv" */
export function exportFilename(today: string): string {
  return `weight-challenge-${today}.csv`;
}
