import { prisma } from "@/lib/prisma";
import {
  getEventTimeConfig,
  periodStart,
  startOfEventDay,
  type Period,
} from "@/lib/time";
import { totalStandardDrinks, type StandardDrinkTotals } from "@/lib/standard-drinks";

/**
 * Read models for the screens. One rule runs through all of them: a DrinkLog
 * with a non-null `deletedAt` does not exist. Every query below filters on it,
 * so an undone drink drops out of counts, the leaderboard and beverage detail
 * at the same moment.
 */

const NOT_DELETED = { deletedAt: null } as const;

const beverageAlcoholSelect = {
  id: true,
  name: true,
  brand: true,
  style: true,
  abv: true,
  volumeMl: true,
  imageUrl: true,
} as const;

export type RecentLog = {
  id: string;
  quantity: number;
  loggedAt: Date;
  beverage: {
    id: string;
    name: string;
    brand: string | null;
    style: string | null;
    abv: number | null;
    volumeMl: number | null;
    imageUrl: string | null;
  };
};

export type UserStats = {
  today: StandardDrinkTotals;
  allTime: StandardDrinkTotals;
};

export async function getUserStats(userId: string, now = new Date()): Promise<UserStats> {
  const config = getEventTimeConfig();
  const dayStart = startOfEventDay(now, config);

  const logs = await prisma.drinkLog.findMany({
    where: { userId, ...NOT_DELETED },
    select: { quantity: true, loggedAt: true, beverage: { select: beverageAlcoholSelect } },
  });

  return {
    today: totalStandardDrinks(logs.filter((l) => l.loggedAt >= dayStart)),
    allTime: totalStandardDrinks(logs),
  };
}

export async function getRecentLogs(userId: string, take = 15): Promise<RecentLog[]> {
  return prisma.drinkLog.findMany({
    where: { userId, ...NOT_DELETED },
    orderBy: { loggedAt: "desc" },
    take,
    select: {
      id: true,
      quantity: true,
      loggedAt: true,
      beverage: { select: beverageAlcoholSelect },
    },
  });
}

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  drinkCount: number;
  standardDrinks: number;
  unknownServings: number;
};

/**
 * Every user appears, including those on zero, so nobody vanishes from the
 * board just because they haven't scanned anything yet this evening.
 */
export async function getLeaderboard(
  period: Period,
  now = new Date(),
): Promise<LeaderboardRow[]> {
  const config = getEventTimeConfig();
  const since = periodStart(period, now, config);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      displayName: true,
      drinkLogs: {
        where: { ...NOT_DELETED, ...(since ? { loggedAt: { gte: since } } : {}) },
        select: { quantity: true, beverage: { select: beverageAlcoholSelect } },
      },
    },
  });

  return users
    .map((user) => {
      const totals = totalStandardDrinks(user.drinkLogs);
      return {
        userId: user.id,
        displayName: user.displayName,
        drinkCount: totals.drinkCount,
        standardDrinks: totals.standardDrinks,
        unknownServings: totals.unknownServings,
      };
    })
    .sort(
      (a, b) =>
        b.drinkCount - a.drinkCount ||
        b.standardDrinks - a.standardDrinks ||
        a.displayName.localeCompare(b.displayName),
    );
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
}

export type BeverageListItem = {
  id: string;
  name: string;
  brand: string | null;
  style: string | null;
  abv: number | null;
  volumeMl: number | null;
  imageUrl: string | null;
  barcode: string | null;
  logCount: number;
};

/**
 * Everything the group has logged, plus the seeded catalog — the manual path
 * that never needs a camera. Matching happens in JS rather than via SQL `LIKE`
 * because LIKE's case sensitivity differs between SQLite and Postgres, and this
 * table holds a few thousand rows at most.
 *
 * The catalog carries one row per *barcode*, so a beer sold in a bottle, a can
 * and three regional variants is five rows with the same name. Un-logged rows
 * are therefore collapsed to one per name+brand before the list is cut to
 * `take`, or a search for "heineken" would return nothing but Heineken. Rows
 * with drinks against them are never collapsed: those are the ones people are
 * actually reaching for, and their counts have to stay distinct.
 */
export async function searchBeverages(query: string, take = 25): Promise<BeverageListItem[]> {
  const rows = await prisma.beverage.findMany({
    orderBy: [{ drinkLogs: { _count: "desc" } }, { createdAt: "desc" }],
    select: {
      ...beverageAlcoholSelect,
      barcode: true,
      _count: { select: { drinkLogs: { where: NOT_DELETED } } },
    },
  });

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((b) =>
        [b.name, b.brand, b.style, b.barcode]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      )
    : rows;

  const seen = new Set<string>();
  const deduped = matches.filter((b) => {
    if (b._count.drinkLogs > 0) return true;
    const key = `${b.name.toLowerCase()}|${b.brand?.toLowerCase() ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, take).map(({ _count, ...b }) => ({ ...b, logCount: _count.drinkLogs }));
}

export async function getBeverageDetail(beverageId: string) {
  const beverage = await prisma.beverage.findUnique({
    where: { id: beverageId },
    select: {
      ...beverageAlcoholSelect,
      barcode: true,
      source: true,
      createdAt: true,
    },
  });
  if (!beverage) return null;

  const logs = await prisma.drinkLog.findMany({
    where: { beverageId, ...NOT_DELETED },
    select: {
      quantity: true,
      loggedAt: true,
      user: { select: { id: true, displayName: true } },
    },
    orderBy: { loggedAt: "desc" },
  });

  const byUser = new Map<
    string,
    { userId: string; displayName: string; count: number; lastAt: Date }
  >();

  for (const log of logs) {
    const existing = byUser.get(log.user.id);
    if (existing) {
      existing.count += log.quantity;
      if (log.loggedAt > existing.lastAt) existing.lastAt = log.loggedAt;
    } else {
      byUser.set(log.user.id, {
        userId: log.user.id,
        displayName: log.user.displayName,
        count: log.quantity,
        lastAt: log.loggedAt,
      });
    }
  }

  const drinkers = [...byUser.values()].sort(
    (a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName),
  );

  return {
    beverage,
    drinkers,
    totalServings: drinkers.reduce((sum, d) => sum + d.count, 0),
  };
}
