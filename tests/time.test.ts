import { describe, expect, it } from "vitest";
import {
  eventDayKey,
  getEventTimeConfig,
  getZonedParts,
  periodStart,
  startOfEventDay,
  startOfEventWeek,
  zonedTimeToUtc,
} from "@/lib/time";

const NY = { timeZone: "America/New_York", dayStartHour: 6 };
const LONDON = { timeZone: "Europe/London", dayStartHour: 6 };

describe("config", () => {
  it("defaults to America/New_York and a 6am rollover", () => {
    expect(getEventTimeConfig({})).toEqual({
      timeZone: "America/New_York",
      dayStartHour: 6,
    });
  });

  it("reads the env vars", () => {
    expect(
      getEventTimeConfig({ EVENT_TIMEZONE: "Europe/Berlin", EVENT_DAY_START_HOUR: "4" }),
    ).toEqual({ timeZone: "Europe/Berlin", dayStartHour: 4 });
  });

  it("falls back rather than crashing on nonsense", () => {
    expect(
      getEventTimeConfig({ EVENT_TIMEZONE: "Mars/Olympus", EVENT_DAY_START_HOUR: "99" }),
    ).toEqual({ timeZone: "America/New_York", dayStartHour: 6 });
  });
});

describe("startOfEventDay", () => {
  it("puts an evening drink on that evening's day", () => {
    // 2025-06-14 21:30 EDT (UTC-4) === 2025-06-15T01:30Z
    const instant = new Date("2025-06-15T01:30:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-14");
    // Day started at 06:00 EDT on the 14th === 10:00Z
    expect(startOfEventDay(instant, NY).toISOString()).toBe("2025-06-14T10:00:00.000Z");
  });

  it("keeps a 2am drink on the night before", () => {
    // 2025-06-15 02:00 EDT === 06:00Z
    const instant = new Date("2025-06-15T06:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-14");
    expect(startOfEventDay(instant, NY).toISOString()).toBe("2025-06-14T10:00:00.000Z");
  });

  it("rolls over at 6am, not midnight", () => {
    const justBefore = new Date("2025-06-15T09:59:00Z"); // 05:59 EDT
    const justAfter = new Date("2025-06-15T10:01:00Z"); // 06:01 EDT

    expect(eventDayKey(justBefore, NY)).toBe("2025-06-14");
    expect(eventDayKey(justAfter, NY)).toBe("2025-06-15");
  });

  it("uses the event zone, not UTC — same instant, different day", () => {
    // 2025-06-15 03:00 UTC is still the 14th in New York (23:00 EDT).
    const instant = new Date("2025-06-15T03:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-14");
    expect(eventDayKey(instant, LONDON)).toBe("2025-06-14"); // 04:00 BST, before 6am
  });

  it("crosses a month boundary correctly", () => {
    // 2025-07-01 01:00 EDT === 05:00Z, so still June 30th's session.
    const instant = new Date("2025-07-01T05:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-30");
  });

  it("crosses a year boundary correctly", () => {
    // 2026-01-01 03:00 EST (UTC-5) === 08:00Z
    const instant = new Date("2026-01-01T08:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-12-31");
  });
});

describe("daylight saving", () => {
  it("handles the spring-forward day (US DST starts 2025-03-09)", () => {
    // 2025-03-09 20:00 EDT === 2025-03-10T00:00Z
    const instant = new Date("2025-03-10T00:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-03-09");
    // 06:00 EDT on the 9th (clocks already forward) === 10:00Z
    expect(startOfEventDay(instant, NY).toISOString()).toBe("2025-03-09T10:00:00.000Z");
  });

  it("handles the fall-back day (US DST ends 2025-11-02)", () => {
    // 2025-11-02 20:00 EST === 2025-11-03T01:00Z
    const instant = new Date("2025-11-03T01:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-11-02");
    // The clocks went back at 02:00 that morning, so 06:00 was already EST
    // (UTC-5) === 11:00Z. The day is 25 hours long and the boundary still lands
    // on the right wall-clock hour.
    expect(startOfEventDay(instant, NY).toISOString()).toBe("2025-11-02T11:00:00.000Z");
  });

  it("stretches to 25 hours across the fall-back and shrinks to 23 across spring-forward", () => {
    const hoursBetween = (a: Date, b: Date) =>
      (startOfEventDay(b, NY).getTime() - startOfEventDay(a, NY).getTime()) / 3_600_000;

    // The clocks change at 02:00, i.e. *inside* the day that began the previous
    // morning — so it's Nov 1st's session that runs an hour long.
    expect(
      hoursBetween(new Date("2025-11-02T00:00:00Z"), new Date("2025-11-03T01:00:00Z")),
    ).toBe(25);

    expect(
      hoursBetween(new Date("2025-03-09T01:00:00Z"), new Date("2025-03-10T00:00:00Z")),
    ).toBe(23);
  });

  it("round-trips a wall-clock time through the zone", () => {
    const utc = zonedTimeToUtc({ year: 2025, month: 6, day: 14, hour: 6 }, NY.timeZone);
    const parts = getZonedParts(utc, NY.timeZone);
    expect(parts).toMatchObject({ year: 2025, month: 6, day: 14, hour: 6, minute: 0 });
  });
});

describe("startOfEventWeek", () => {
  it("goes back to the most recent Monday 6am", () => {
    // Sunday 2025-06-15 21:00 EDT === 2025-06-16T01:00Z; event day is the 15th.
    const instant = new Date("2025-06-16T01:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-15");
    // Monday of that week is 2025-06-09; 06:00 EDT === 10:00Z
    expect(startOfEventWeek(instant, NY).toISOString()).toBe("2025-06-09T10:00:00.000Z");
  });

  it("treats Monday itself as the start of its own week", () => {
    // Monday 2025-06-09 12:00 EDT === 16:00Z
    const instant = new Date("2025-06-09T16:00:00Z");
    expect(startOfEventWeek(instant, NY).toISOString()).toBe("2025-06-09T10:00:00.000Z");
  });

  it("puts a Monday 2am drink in the previous week", () => {
    // Monday 2025-06-09 02:00 EDT === 06:00Z -> event day is Sunday the 8th.
    const instant = new Date("2025-06-09T06:00:00Z");
    expect(eventDayKey(instant, NY)).toBe("2025-06-08");
    expect(startOfEventWeek(instant, NY).toISOString()).toBe("2025-06-02T10:00:00.000Z");
  });
});

describe("periodStart", () => {
  const now = new Date("2025-06-16T01:00:00Z");

  it("returns the day start for today", () => {
    expect(periodStart("today", now, NY)?.toISOString()).toBe("2025-06-15T10:00:00.000Z");
  });

  it("returns the week start for this week", () => {
    expect(periodStart("week", now, NY)?.toISOString()).toBe("2025-06-09T10:00:00.000Z");
  });

  it("returns null for all time", () => {
    expect(periodStart("all", now, NY)).toBeNull();
  });
});
