/**
 * Event-time helpers.
 *
 * Every timestamp in the database is stored as UTC. "Today" and "this week",
 * however, are questions about the *event's* wall clock, not the server's
 * locale and not whatever the phone in someone's pocket thinks the time is —
 * otherwise two people standing next to each other could see different
 * leaderboards.
 *
 * Two knobs, both env-configurable:
 *   EVENT_TIMEZONE        IANA zone, default America/New_York
 *   EVENT_DAY_START_HOUR  hour the drinking day rolls over, default 6 (6am),
 *                         so a night that runs past midnight stays on one day.
 *
 * Implemented against `Intl.DateTimeFormat` only — no date library, and DST
 * transitions are handled by resolving wall-clock times through the zone twice.
 */

export const DEFAULT_EVENT_TIMEZONE = "America/New_York";
export const DEFAULT_DAY_START_HOUR = 6;

/** Week starts on Monday (1 = Monday in the 0=Sunday..6=Saturday numbering). */
const WEEK_START_WEEKDAY = 1;

export type EventTimeConfig = {
  timeZone: string;
  dayStartHour: number;
};

export type Period = "today" | "week" | "all";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Reads EVENT_TIMEZONE / EVENT_DAY_START_HOUR, falling back to the defaults. */
export function getEventTimeConfig(
  env: Record<string, string | undefined> = process.env,
): EventTimeConfig {
  const rawTz = env.EVENT_TIMEZONE?.trim();
  const timeZone = rawTz && isValidTimeZone(rawTz) ? rawTz : DEFAULT_EVENT_TIMEZONE;

  const rawHour = env.EVENT_DAY_START_HOUR?.trim();
  const parsedHour = rawHour === undefined || rawHour === "" ? NaN : Number(rawHour);
  const dayStartHour =
    Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
      ? parsedHour
      : DEFAULT_DAY_START_HOUR;

  return { timeZone, dayStartHour };
}

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock fields of `instant` as seen in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (east positive). */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision from the instant: formatToParts has none.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Turns a wall-clock time in `timeZone` into the UTC instant it names.
 *
 * Resolves in two passes because the offset we need depends on the answer:
 * guess with the offset at the naive instant, then correct using the offset
 * actually in force there. That handles both DST directions. Wall-clock times
 * that don't exist (the spring-forward gap) land on the instant just after the
 * jump, which is the conventional behaviour and fine for a 6am boundary.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );

  const firstOffset = zoneOffsetMs(new Date(naive), timeZone);
  let ts = naive - firstOffset;

  const secondOffset = zoneOffsetMs(new Date(ts), timeZone);
  if (secondOffset !== firstOffset) ts = naive - secondOffset;

  return new Date(ts);
}

/** Adds whole days to a plain calendar date, rolling months/years correctly. */
function addCalendarDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Sunday .. 6 = Saturday, for a plain calendar date. */
function weekdayOf(date: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * The calendar date the drinking day belongs to. A drink logged at 02:00 on
 * Sunday belongs to Saturday's session when the day starts at 6am.
 */
export function eventDayDate(
  instant: Date,
  config: EventTimeConfig,
): { year: number; month: number; day: number } {
  const p = getZonedParts(instant, config.timeZone);
  const base = { year: p.year, month: p.month, day: p.day };
  return p.hour < config.dayStartHour ? addCalendarDays(base, -1) : base;
}

/** "YYYY-MM-DD" of the drinking day — handy for grouping and debugging. */
export function eventDayKey(instant: Date, config: EventTimeConfig): string {
  const d = eventDayDate(instant, config);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** UTC instant at which the drinking day containing `instant` began. */
export function startOfEventDay(instant: Date, config: EventTimeConfig): Date {
  const d = eventDayDate(instant, config);
  return zonedTimeToUtc({ ...d, hour: config.dayStartHour }, config.timeZone);
}

/** UTC instant at which the drinking *week* containing `instant` began. */
export function startOfEventWeek(instant: Date, config: EventTimeConfig): Date {
  const d = eventDayDate(instant, config);
  const back = (weekdayOf(d) - WEEK_START_WEEKDAY + 7) % 7;
  const weekStart = addCalendarDays(d, -back);
  return zonedTimeToUtc({ ...weekStart, hour: config.dayStartHour }, config.timeZone);
}

/**
 * Lower bound for a leaderboard period, or null for "all time".
 * Everything downstream just does `loggedAt >= since`.
 */
export function periodStart(
  period: Period,
  now: Date,
  config: EventTimeConfig,
): Date | null {
  switch (period) {
    case "today":
      return startOfEventDay(now, config);
    case "week":
      return startOfEventWeek(now, config);
    case "all":
      return null;
  }
}

export function isPeriod(value: unknown): value is Period {
  return value === "today" || value === "week" || value === "all";
}

/** Short human label in event time, e.g. "Sat 11:42 PM". */
export function formatEventTime(instant: Date, config: EventTimeConfig): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}
