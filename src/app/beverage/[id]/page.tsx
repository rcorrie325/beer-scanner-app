import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getBeverageDetail } from "@/lib/queries";
import { beverageMeta, perServingStandardDrinks, pluralize } from "@/lib/format";
import { getEventTimeConfig, formatEventTime } from "@/lib/time";
import { AppShell } from "@/components/AppShell";
import { logAgainAction } from "@/actions/logs";

export const dynamic = "force-dynamic";

export default async function BeverageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { id } = await params;
  const detail = await getBeverageDetail(id);
  if (!detail) notFound();

  const { beverage, drinkers, totalServings } = detail;
  const config = getEventTimeConfig();
  const meta = beverageMeta(beverage);
  const perServing = perServingStandardDrinks(beverage);

  return (
    <AppShell displayName={user.displayName}>
      <div className="flex gap-3">
        {beverage.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={beverage.imageUrl}
            alt=""
            className="h-28 w-24 shrink-0 rounded-2xl bg-night-800 object-contain"
          />
        ) : (
          <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-2xl bg-night-800 text-4xl">
            🍺
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{beverage.name}</h1>
          {beverage.brand && <p className="text-foam/60">{beverage.brand}</p>}
          {meta && <p className="mt-1 text-sm text-foam/50">{meta}</p>}
          <p className="mt-1 text-xs text-foam/35">
            {perServing ?? "No ABV/volume on record"}
            {" · "}
            {sourceLabel(beverage.source)}
          </p>
          {beverage.barcode && (
            <p className="mt-1 font-mono text-xs text-foam/30">{beverage.barcode}</p>
          )}
        </div>
      </div>

      <form action={logAgainAction} className="mt-4">
        <input type="hidden" name="beverageId" value={beverage.id} />
        <button
          type="submit"
          className="tap h-14 w-full rounded-2xl bg-amber-glow text-lg font-semibold text-night-950 active:scale-[0.98]"
        >
          +1 for me
        </button>
      </form>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
          {totalServings} {pluralize(totalServings, "serving")} across the group
        </h2>

        {drinkers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-night-700 px-4 py-6 text-center text-sm text-foam/50">
            Nobody has logged this one yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {drinkers.map((drinker) => (
              <li
                key={drinker.userId}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                  drinker.userId === user.id
                    ? "border-amber-deep bg-night-800"
                    : "border-night-800 bg-night-900"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{drinker.displayName}</p>
                  <p className="text-xs text-foam/40">
                    last: {formatEventTime(drinker.lastAt, config)}
                  </p>
                </div>
                <p className="text-xl font-bold tabular-nums">×{drinker.count}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/"
        className="tap mt-4 flex items-center justify-center rounded-2xl border border-night-700 text-sm font-medium"
      >
        Back
      </Link>
    </AppShell>
  );
}

/** Where this beverage's details came from. See Beverage.source in the schema. */
function sourceLabel(source: string): string {
  switch (source) {
    case "scan":
      return "from a scan";
    case "catalog":
      return "from the built-in catalog";
    default:
      return "added by hand";
  }
}
