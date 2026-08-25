/**
 * What counts as "today" is the load-bearing question in this app: get it wrong
 * and an evening weigh-in files under tomorrow's date.
 *
 * Mountain Time is the default and the awkward case — it sits six or seven
 * hours behind UTC depending on the season, so UTC has already rolled over to
 * the next day for the last six hours of every Denver evening.
 */

import { describe, expect, it } from "vitest";
import {
  allTimeZones,
  COMMON_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  timeInZone,
  todayInZone,
  zoneAbbreviation,
  zoneCityName,
} from "./timezone";

/** A UTC instant, written the way it reads in the database. */
const utc = (iso: string) => new Date(iso);

describe("the default", () => {
  it("is Mountain Time", () => {
    expect(DEFAULT_TIME_ZONE).toBe("America/Denver");
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true);
  });

  it("is the first option offered in the picker", () => {
    expect(COMMON_TIME_ZONES[0].id).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("todayInZone, Mountain Time", () => {
  it("still reads as yesterday during a Denver evening", () => {
    // 11:59pm on 25 August in Denver is already 05:59 on the 26th in UTC.
    // A server working in UTC would file this under the wrong day.
    expect(todayInZone("America/Denver", utc("2026-08-26T05:59:00Z"))).toBe("2026-08-25");
  });

  it("rolls over at Denver midnight, not UTC midnight", () => {
    expect(todayInZone("America/Denver", utc("2026-08-26T05:59:59Z"))).toBe("2026-08-25");
    expect(todayInZone("America/Denver", utc("2026-08-26T06:00:00Z"))).toBe("2026-08-26");
  });

  it("uses the standard-time offset in winter", () => {
    // MST is UTC-7, so the rollover happens an hour later in UTC terms.
    expect(todayInZone("America/Denver", utc("2026-12-16T06:59:59Z"))).toBe("2026-12-15");
    expect(todayInZone("America/Denver", utc("2026-12-16T07:00:00Z"))).toBe("2026-12-16");
  });

  it("moves the rollover boundary an hour when clocks spring forward", () => {
    // 8 March 2026: clocks jump 2am to 3am, MST (UTC-7) becomes MDT (UTC-6).
    // The day before the switch, midnight in Denver is 07:00 UTC.
    expect(todayInZone("America/Denver", utc("2026-03-08T06:59:00Z"))).toBe("2026-03-07");
    expect(todayInZone("America/Denver", utc("2026-03-08T07:00:00Z"))).toBe("2026-03-08");

    // The day after, it's 06:00 UTC — an hour earlier.
    expect(todayInZone("America/Denver", utc("2026-03-09T05:59:00Z"))).toBe("2026-03-08");
    expect(todayInZone("America/Denver", utc("2026-03-09T06:00:00Z"))).toBe("2026-03-09");
  });

  it("skips no date across the lost hour", () => {
    // 2am never happens on 8 March. Walking hour by hour through the switch,
    // every calendar date must still appear exactly once in the sequence.
    const start = utc("2026-03-07T00:00:00Z").getTime();
    const days = new Set<string>();

    for (let hour = 0; hour < 72; hour += 1) {
      days.add(todayInZone("America/Denver", new Date(start + hour * 3_600_000)));
    }

    expect([...days].sort()).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
  });

  it("handles the fall-back day, when 1am happens twice", () => {
    // 1 November 2026: clocks go back. Both 1am instants are still the 1st.
    expect(todayInZone("America/Denver", utc("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
    expect(todayInZone("America/Denver", utc("2026-11-01T08:30:00Z"))).toBe("2026-11-01");
    expect(todayInZone("America/Denver", utc("2026-11-02T06:59:00Z"))).toBe("2026-11-01");
  });

  it("crosses a year boundary correctly", () => {
    expect(todayInZone("America/Denver", utc("2027-01-01T06:59:00Z"))).toBe("2026-12-31");
    expect(todayInZone("America/Denver", utc("2027-01-01T07:00:00Z"))).toBe("2027-01-01");
  });

  it("always returns a zero-padded YYYY-MM-DD", () => {
    expect(todayInZone("America/Denver", utc("2026-03-09T18:00:00Z"))).toBe("2026-03-09");
    expect(todayInZone("America/Denver", utc("2026-11-05T18:00:00Z"))).toBe("2026-11-05");
  });
});

describe("todayInZone, other zones", () => {
  it("gives different answers for the same instant", () => {
    // 06:30 UTC: already the 26th in London, still the 25th across the US.
    const instant = utc("2026-08-26T06:30:00Z");

    expect(todayInZone("UTC", instant)).toBe("2026-08-26");
    expect(todayInZone("Europe/London", instant)).toBe("2026-08-26");
    expect(todayInZone("America/Denver", instant)).toBe("2026-08-26");
    expect(todayInZone("America/Los_Angeles", instant)).toBe("2026-08-25");
    expect(todayInZone("Pacific/Honolulu", instant)).toBe("2026-08-25");
  });

  it("handles Phoenix, which never observes daylight saving", () => {
    // In summer Phoenix is an hour behind Denver's wall clock.
    const instant = utc("2026-08-26T06:30:00Z");

    expect(todayInZone("America/Denver", instant)).toBe("2026-08-26");
    expect(todayInZone("America/Phoenix", instant)).toBe("2026-08-25");
  });
});

describe("isValidTimeZone", () => {
  it("accepts every zone offered in the picker", () => {
    for (const zone of COMMON_TIME_ZONES) {
      expect(isValidTimeZone(zone.id), zone.id).toBe(true);
    }
  });

  it("rejects nonsense rather than letting it reach Intl", () => {
    for (const bad of ["", "Mars/Olympus_Mons", "not a zone", "MST7MDT/../..", "x".repeat(80)]) {
      expect(isValidTimeZone(bad), bad).toBe(false);
    }
  });
});

describe("allTimeZones", () => {
  it("returns a long list that includes the common ones", () => {
    const zones = allTimeZones();

    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain("America/Denver");
    expect(zones).toContain("Europe/London");
  });
});

describe("display helpers", () => {
  it("reports the seasonal abbreviation", () => {
    expect(zoneAbbreviation("America/Denver", utc("2026-08-26T18:00:00Z"))).toBe("MDT");
    expect(zoneAbbreviation("America/Denver", utc("2026-12-16T18:00:00Z"))).toBe("MST");
  });

  it("formats a wall-clock time", () => {
    // 18:00 UTC in August is noon in Denver.
    expect(timeInZone("America/Denver", utc("2026-08-26T18:00:00Z"))).toBe("12:00 PM");
  });

  it("pulls a readable city out of an identifier", () => {
    expect(zoneCityName("America/Denver")).toBe("Denver");
    expect(zoneCityName("America/Los_Angeles")).toBe("Los Angeles");
    expect(zoneCityName("UTC")).toBe("UTC");
  });
});
