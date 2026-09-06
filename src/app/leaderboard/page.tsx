import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getLeaderboard, type LeaderboardRow } from "@/lib/queries";
import { getEventTimeConfig } from "@/lib/time";
import { formatStandardDrinks } from "@/lib/standard-drinks";
import { periodSchema } from "@/lib/validation";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
] as const;

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { period: rawPeriod } = await searchParams;
  const period = periodSchema.parse(rawPeriod);

  const config = getEventTimeConfig();
  const rows = await getLeaderboard(period);

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Leaderboard</h1>

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-night-800 bg-night-900 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/leaderboard?period=${tab.value}`}
            aria-current={tab.value === period ? "page" : undefined}
            className={`rounded-xl py-2.5 text-center text-sm font-medium transition ${
              tab.value === period ? "bg-amber-glow text-night-950" : "text-foam/60"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <ol className="space-y-2">
        {rows.map((row, index) => {
          const isMe = row.userId === user.id;
          return (
            <li
              key={row.userId}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
                isMe ? "border-amber-deep bg-night-800" : "border-night-800 bg-night-900"
              }`}
            >
              <span className="w-8 shrink-0 text-center text-lg">
                {row.drinkCount > 0 && index < MEDALS.length ? (
                  <span aria-hidden>{MEDALS[index]}</span>
                ) : (
                  <span className="text-sm text-foam/40">{index + 1}</span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {row.displayName}
                  {isMe && <span className="ml-1 text-xs font-normal text-amber-glow">you</span>}
                </p>
                <p className="text-xs text-foam/50">{standardDrinkLine(row)}</p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold tabular-nums">{row.drinkCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-foam/40">drinks</p>
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-night-700 px-4 py-6 text-center text-sm text-foam/50">
          No one has signed in yet.
        </p>
      )}

      <p className="mt-4 text-center text-xs text-foam/35">
        Days roll over at {config.dayStartHour}:00 in {config.timeZone}. A standard drink is 14 g of
        alcohol; drinks with no
        ABV or volume count towards the number on the right only.
      </p>
    </AppShell>
  );
}

/**
 * Someone on zero hasn't got "no ABV data" — they've got nothing at all. The
 * two cases read very differently on a board that starts empty.
 */
function standardDrinkLine(row: LeaderboardRow): string {
  if (row.drinkCount === 0) return "nothing yet";

  const suffix = row.unknownServings > 0 ? ` · ${row.unknownServings} unknown` : "";
  if (row.standardDrinks === 0) return `no ABV data${suffix}`;

  return `${formatStandardDrinks(row.standardDrinks)} standard drinks${suffix}`;
}
