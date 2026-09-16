/**
 * Export correctness matters more than it looks: this is the copy of the data
 * that leaves the app, and a quoting bug silently shifts every later column by
 * one without anything looking wrong until you read a row closely.
 */

import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvField, EXPORT_COLUMNS, exportFilename, toCsvRow } from "./csv";
import type { EntryInput, PlanInput } from "./calc";

/** Mountain Time, as the app is configured. */
const ZONE = "America/Denver";

const plan: PlanInput = {
  startDate: "2026-03-03",
  days: 30,
  rmr: 1980,
  calsPerLb: 3500,
  lbsToLose: 10,
  targetActiveCals: 1000,
  startWeight: 224.9,
  startBodyFat: 0.274,
  startVo2Max: 35.4,
  startSystolic: 134,
  startDiastolic: 91,
  fastingPlan: null,
  preStartFastAt: null,
};

const entries: EntryInput[] = [
  {
    date: "2026-03-03",
    weight: 224.9,
    bodyFat: 0.274,
    vo2Max: 35.4,
    systolic: 134,
    diastolic: 91,
    consumedCals: 1450,
    activeCals: 1157,
    fastStartAt: null,
    fastEndAt: null,
  },
  {
    // A partial day: weight only, which the export must not treat as zeroes.
    date: "2026-03-04",
    weight: 222.8,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
    fastStartAt: null,
    fastEndAt: null,
  },
];

describe("escapeCsvField", () => {
  it("leaves ordinary values alone", () => {
    expect(escapeCsvField("2026 Challenge")).toBe("2026 Challenge");
    expect(escapeCsvField("232.6")).toBe("232.6");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvField("Cut, phase two")).toBe('"Cut, phase two"');
  });

  it("quotes and doubles an embedded quote", () => {
    expect(escapeCsvField('The "real" attempt')).toBe('"The ""real"" attempt"');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("quotes a value that is only a quote", () => {
    expect(escapeCsvField('"')).toBe('""""');
  });
});

describe("toCsvRow", () => {
  it("writes null as an empty field, not as the word null or a zero", () => {
    expect(toCsvRow(["a", null, 1])).toBe("a,,1");
  });

  it("preserves empty strings and zeroes distinctly", () => {
    // A rest day really is 0 active calories; an unlogged one is blank.
    expect(toCsvRow([0, null])).toBe("0,");
  });
});

describe("buildCsv", () => {
  const csv = buildCsv([
    { name: "Attempt 3/3", status: "archived", plan, entries },
  ], ZONE);
  const lines = csv.trimEnd().split("\r\n");

  it("starts with the header row", () => {
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","));
  });

  it("writes one row per logged day", () => {
    expect(lines).toHaveLength(3);
  });

  it("carries the plan name and status onto every row", () => {
    expect(lines[1].startsWith("Attempt 3/3,archived,2026-03-03,1,")).toBe(true);
    expect(lines[2].startsWith("Attempt 3/3,archived,2026-03-04,2,")).toBe(true);
  });

  it("exports body fat as the percentage that was typed, not the stored fraction", () => {
    expect(lines[1]).toContain(",27.4,");
  });

  it("includes the derived deficit columns", () => {
    // (1980 + 1157) − 1450 = 1687, and 1687 − 1166.67 = 520.33.
    const fields = lines[1].split(",");
    expect(fields[EXPORT_COLUMNS.indexOf("daily_deficit")]).toBe("1687");
    expect(fields[EXPORT_COLUMNS.indexOf("deficit_to_plan")]).toBe("520.33");
  });

  it("rounds away floating-point noise in the derived columns", () => {
    // The raw figure is 520.3333333333303; nobody wants that in a spreadsheet.
    expect(lines[1]).not.toMatch(/\d\.\d{3,}/);
  });

  it("leaves unlogged measurements blank rather than zero", () => {
    const fields = lines[2].split(",");

    expect(fields[EXPORT_COLUMNS.indexOf("weight_lb")]).toBe("222.8");
    expect(fields[EXPORT_COLUMNS.indexOf("consumed_cals")]).toBe("");
    expect(fields[EXPORT_COLUMNS.indexOf("daily_deficit")]).toBe("");
  });

  it("keeps every column aligned when a plan name contains a comma", () => {
    const tricky = buildCsv([
      { name: 'Cut, "hard" mode', status: "active", plan, entries: [entries[0]] },
    ], ZONE);
    const row = tricky.trimEnd().split("\r\n")[1];

    expect(row.startsWith('"Cut, ""hard"" mode",active,')).toBe(true);
    // Quoted commas must not create extra fields.
    expect(splitCsvLine(row)).toHaveLength(EXPORT_COLUMNS.length);
  });

  it("includes archived plans as well as the active one", () => {
    const both = buildCsv([
      { name: "Old", status: "archived", plan, entries: [entries[0]] },
      { name: "Current", status: "active", plan, entries: [entries[1]] },
    ], ZONE);

    expect(both).toContain("Old,archived,");
    expect(both).toContain("Current,active,");
  });

  it("emits just a header when nothing has been logged", () => {
    const empty = buildCsv([{ name: "New", status: "active", plan, entries: [] }], ZONE);
    expect(empty.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("ends with a line terminator", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("sorts a plan's days chronologically regardless of input order", () => {
    const shuffled = buildCsv([
      { name: "P", status: "active", plan, entries: [entries[1], entries[0]] },
    ], ZONE);
    const rows = shuffled.trimEnd().split("\r\n");

    expect(rows[1]).toContain("2026-03-03");
    expect(rows[2]).toContain("2026-03-04");
  });
});

describe("exportFilename", () => {
  it("is dated so successive exports don't overwrite each other", () => {
    expect(exportFilename("2026-08-25")).toBe("weight-challenge-2026-08-25.csv");
  });
});

/** Minimal RFC 4180 reader, used only to prove quoting survives a round trip. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

describe("fasting columns", () => {
  /** An 18:6 plan with one whole fast: 6:30pm on the 3rd to 12:30pm on the 4th. */
  const fastingPlan: PlanInput = { ...plan, fastingPlan: "fast18_6" };

  const fastingEntries: EntryInput[] = [
    {
      ...entries[0],
      date: "2026-03-03",
      // 2026-03-03 18:30 MST
      fastStartAt: new Date("2026-03-04T01:30:00Z"),
    },
    {
      ...entries[1],
      date: "2026-03-04",
      // 2026-03-04 12:30 MST — eighteen hours later.
      fastEndAt: new Date("2026-03-04T19:30:00Z"),
    },
  ];

  const rows = buildCsv(
    [{ name: "P", status: "active", plan: fastingPlan, entries: fastingEntries }],
    ZONE,
  )
    .trimEnd()
    .split("\r\n")
    .slice(1)
    .map(splitCsvLine);

  const column = (row: string[], name: (typeof EXPORT_COLUMNS)[number]) =>
    row[EXPORT_COLUMNS.indexOf(name)];

  it("writes each time against the day it was logged on", () => {
    expect(column(rows[0], "fast_started")).toBe("18:30");
    expect(column(rows[0], "fast_ended")).toBe("");
    expect(column(rows[1], "fast_started")).toBe("");
    expect(column(rows[1], "fast_ended")).toBe("12:30");
  });

  it("credits the hours and the verdict to the day the fast ended", () => {
    // The evening the fast began banks nothing on its own.
    expect(column(rows[0], "fast_hours")).toBe("");
    expect(column(rows[0], "fast_goal_met")).toBe("");

    expect(column(rows[1], "fast_hours")).toBe("18");
    expect(column(rows[1], "fast_goal_met")).toBe("yes");
  });

  it("leaves the hours empty rather than zero when no fast completed", () => {
    const noFast = buildCsv(
      [{ name: "P", status: "active", plan: fastingPlan, entries: [entries[0]] }],
      ZONE,
    )
      .trimEnd()
      .split("\r\n")
      .slice(1)
      .map(splitCsvLine);

    expect(column(noFast[0], "fast_hours")).toBe("");
    expect(column(noFast[0], "fast_goal_met")).toBe("");
  });

  it("says no when a fast completed but fell short", () => {
    const short = buildCsv(
      [
        {
          name: "P",
          status: "active",
          plan: fastingPlan,
          entries: [
            fastingEntries[0],
            { ...fastingEntries[1], fastEndAt: new Date("2026-03-04T16:30:00Z") },
          ],
        },
      ],
      ZONE,
    )
      .trimEnd()
      .split("\r\n")
      .slice(1)
      .map(splitCsvLine);

    expect(column(short[1], "fast_hours")).toBe("15");
    expect(column(short[1], "fast_goal_met")).toBe("no");
  });

  it("leaves the columns empty for a plan that doesn't fast", () => {
    // Same fast times logged, but the plan has fasting switched off: there is
    // no goal to judge them against, so there is no verdict to report.
    const off = buildCsv(
      [{ name: "P", status: "active", plan, entries: fastingEntries }],
      ZONE,
    )
      .trimEnd()
      .split("\r\n")
      .slice(1)
      .map(splitCsvLine);

    expect(column(off[1], "fast_hours")).toBe("");
    expect(column(off[1], "fast_goal_met")).toBe("");
    // The raw times are still exported — they are data you entered.
    expect(column(off[1], "fast_ended")).toBe("12:30");
  });
});

describe("the pre-plan evening column", () => {
  const withPreStart: PlanInput = {
    ...plan,
    fastingPlan: "fast18_6",
    // 6:30 PM Mountain on 2 March, the evening before a plan starting the 3rd.
    preStartFastAt: new Date("2026-03-03T01:30:00Z"),
  };

  const rowsOf = (p: PlanInput, e: EntryInput[]) =>
    buildCsv([{ name: "P", status: "active", plan: p, entries: e }], ZONE)
      .trimEnd()
      .split("\r\n")
      .slice(1)
      .map(splitCsvLine);

  const column = (row: string[], name: (typeof EXPORT_COLUMNS)[number]) =>
    row[EXPORT_COLUMNS.indexOf(name)];

  it("writes it on the plan's first row and nowhere else", () => {
    const rows = rowsOf(withPreStart, [entries[0], entries[1]]);

    expect(column(rows[0], "pre_plan_fast_started")).toBe("18:30");
    expect(column(rows[1], "pre_plan_fast_started")).toBe("");
  });

  it("credits day one's fast once that evening is present", () => {
    const rows = rowsOf(withPreStart, [
      // 12:30 PM on the 3rd — eighteen hours after the evening before.
      { ...entries[0], fastEndAt: new Date("2026-03-03T19:30:00Z") },
    ]);

    expect(column(rows[0], "fast_hours")).toBe("18");
    expect(column(rows[0], "fast_goal_met")).toBe("yes");
  });

  it("gives it a row of its own when day one has nothing else logged", () => {
    // Otherwise a time you entered would exist only in the database, and an
    // export that drops it isn't an export.
    const rows = rowsOf(withPreStart, [entries[1]]);

    expect(rows).toHaveLength(2);
    expect(column(rows[0], "date")).toBe("2026-03-03");
    expect(column(rows[0], "pre_plan_fast_started")).toBe("18:30");
    expect(column(rows[0], "weight_lb")).toBe("");
  });

  it("stays empty for a plan that has none", () => {
    const rows = rowsOf({ ...plan, fastingPlan: "fast18_6" }, [entries[0]]);
    expect(column(rows[0], "pre_plan_fast_started")).toBe("");
    expect(rows).toHaveLength(1);
  });
});
