/**
 * Export correctness matters more than it looks: this is the copy of the data
 * that leaves the app, and a quoting bug silently shifts every later column by
 * one without anything looking wrong until you read a row closely.
 */

import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvField, EXPORT_COLUMNS, exportFilename, toCsvRow } from "./csv";
import type { EntryInput, PlanInput } from "./calc";

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
  ]);
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
    ]);
    const row = tricky.trimEnd().split("\r\n")[1];

    expect(row.startsWith('"Cut, ""hard"" mode",active,')).toBe(true);
    // Quoted commas must not create extra fields.
    expect(splitCsvLine(row)).toHaveLength(EXPORT_COLUMNS.length);
  });

  it("includes archived plans as well as the active one", () => {
    const both = buildCsv([
      { name: "Old", status: "archived", plan, entries: [entries[0]] },
      { name: "Current", status: "active", plan, entries: [entries[1]] },
    ]);

    expect(both).toContain("Old,archived,");
    expect(both).toContain("Current,active,");
  });

  it("emits just a header when nothing has been logged", () => {
    const empty = buildCsv([{ name: "New", status: "active", plan, entries: [] }]);
    expect(empty.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("ends with a line terminator", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("sorts a plan's days chronologically regardless of input order", () => {
    const shuffled = buildCsv([
      { name: "P", status: "active", plan, entries: [entries[1], entries[0]] },
    ]);
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
