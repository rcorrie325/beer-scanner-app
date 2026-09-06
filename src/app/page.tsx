import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getRecentLogs, getUserStats } from "@/lib/queries";
import { getEventTimeConfig, formatEventTime } from "@/lib/time";
import { beverageMeta } from "@/lib/format";
import { formatStandardDrinks } from "@/lib/standard-drinks";
import { AppShell } from "@/components/AppShell";
import { UndoToast } from "@/components/UndoToast";
import { logAgainAction, undoLogAction } from "@/actions/logs";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { undo } = await searchParams;
  const config = getEventTimeConfig();

  const [stats, recent] = await Promise.all([
    getUserStats(user.id),
    getRecentLogs(user.id),
  ]);

  // Only offer the toast if the log is real, still undeleted, and this user's.
  const undoLog = undo
    ? await prisma.drinkLog.findFirst({
        where: { id: undo, userId: user.id, deletedAt: null },
        select: { id: true, beverage: { select: { name: true } } },
      })
    : null;

  const newestLogId = recent[0]?.id ?? null;

  return (
    <AppShell displayName={user.displayName}>
      <section className="grid grid-cols-2 gap-3">
        <StatCard
          label="Today"
          value={stats.today.drinkCount}
          sub={standardDrinkLine(stats.today)}
          highlight
        />
        <StatCard
          label="All time"
          value={stats.allTime.drinkCount}
          sub={standardDrinkLine(stats.allTime)}
        />
      </section>

      <Link
        href="/scan"
        className="mt-4 flex h-28 w-full items-center justify-center gap-3 rounded-3xl bg-amber-glow text-2xl font-bold text-night-950 transition active:scale-[0.98]"
      >
        <span aria-hidden className="text-3xl">
          📷
        </span>
        Scan a drink
      </Link>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <Link
          href="/add"
          className="tap flex items-center justify-center rounded-2xl border border-night-700 bg-night-900 text-sm font-medium"
        >
          Add without camera
        </Link>
        <Link
          href="/leaderboard"
          className="tap flex items-center justify-center rounded-2xl border border-night-700 bg-night-900 text-sm font-medium"
        >
          Leaderboard
        </Link>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
          Recent
        </h2>

        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-night-700 px-4 py-6 text-center text-sm text-foam/50">
            Nothing yet. Scan something.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((log) => {
              const meta = beverageMeta(log.beverage);
              return (
                <li
                  key={log.id}
                  className="flex items-center gap-3 rounded-2xl border border-night-800 bg-night-900 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/beverage/${log.beverage.id}`} className="block truncate font-medium">
                      {log.beverage.name}
                      {log.quantity > 1 && (
                        <span className="ml-1 text-foam/50">×{log.quantity}</span>
                      )}
                    </Link>
                    <p className="truncate text-xs text-foam/50">
                      {[log.beverage.brand, meta].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-xs text-foam/35">
                      {formatEventTime(log.loggedAt, config)}
                    </p>
                  </div>

                  {log.id === newestLogId && (
                    <form action={undoLogAction}>
                      <input type="hidden" name="logId" value={log.id} />
                      <button
                        type="submit"
                        className="rounded-xl border border-night-700 px-3 py-2 text-xs font-medium text-foam/70 active:scale-95"
                      >
                        Undo
                      </button>
                    </form>
                  )}

                  <form action={logAgainAction}>
                    <input type="hidden" name="beverageId" value={log.beverage.id} />
                    <button
                      type="submit"
                      aria-label={`Log another ${log.beverage.name}`}
                      className="h-11 w-12 rounded-xl bg-night-700 text-sm font-bold active:scale-95"
                    >
                      +1
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {undoLog && <UndoToast logId={undoLog.id} label={undoLog.beverage.name} />}
    </AppShell>
  );
}

function standardDrinkLine(totals: {
  standardDrinks: number;
  countedServings: number;
  unknownServings: number;
}): string {
  if (totals.countedServings === 0) {
    return totals.unknownServings > 0 ? "no ABV data" : "—";
  }
  const base = `${formatStandardDrinks(totals.standardDrinks)} std`;
  return totals.unknownServings > 0 ? `${base} · ${totals.unknownServings} unknown` : base;
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border px-4 py-4 ${
        highlight ? "border-amber-deep bg-night-800" : "border-night-800 bg-night-900"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foam/50">{label}</p>
      <p className={`mt-1 text-4xl font-bold ${highlight ? "text-amber-glow" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-foam/50">{sub}</p>
    </div>
  );
}
