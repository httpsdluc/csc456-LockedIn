import { describe, expect, it } from "vitest";
import { parseDay, toIsoUtc } from "../src/dates.js";

describe("parseDay", () => {
  it("uses the UTC date when the supplied clock has a timezone offset", () => {
    const day = parseDay(undefined, new Date("2026-10-26T23:30:00-04:00"));
    expect(day).toEqual({
      date: "2026-10-27",
      start: new Date("2026-10-27T00:00:00Z"),
      end: new Date("2026-10-28T00:00:00Z"),
    });
  });

  it.each([
    ["2024-02-29", "2024-03-01"],
    ["2026-12-31", "2027-01-01"],
    ["2026-03-08", "2026-03-09"],
  ])("returns UTC midnight boundaries for %s", (date, nextDate) => {
    expect(parseDay(date)).toEqual({
      date,
      start: new Date(`${date}T00:00:00Z`),
      end: new Date(`${nextDate}T00:00:00Z`),
    });
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "", null, [], 2026])(
    "rejects an invalid date query: %j",
    (value) => expect(parseDay(value)).toBeNull(),
  );
});

describe("toIsoUtc", () => {
  it("normalizes timezone offsets and removes empty milliseconds", () => {
    expect(toIsoUtc(new Date("2026-10-26T08:00:00-04:00"))).toBe("2026-10-26T12:00:00Z");
  });

  it("preserves nonzero milliseconds", () => {
    expect(toIsoUtc(new Date("2026-10-26T08:00:00.250Z"))).toBe("2026-10-26T08:00:00.250Z");
  });
});
