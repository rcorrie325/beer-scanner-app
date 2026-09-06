import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { beverageMeta, perServingStandardDrinks } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { QuantityStepper } from "@/components/QuantityStepper";
import { LogDrinkForm } from "@/components/LogDrinkForm";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { id } = await params;
  const beverage = await prisma.beverage.findUnique({ where: { id } });
  if (!beverage) notFound();

  const meta = beverageMeta(beverage);
  const perServing = perServingStandardDrinks(beverage);

  // Open Food Facts happily returns crisps and shampoo. A scanned product with
  // no recognisable beer style *and* no alcohol figure is very likely not a
  // drink, so flag it rather than silently adding it to someone's total.
  const looksSuspicious =
    beverage.source === "scan" && !beverage.style && beverage.abv === null;

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Confirm</h1>

      <div className="flex gap-3 rounded-3xl border border-night-800 bg-night-900 p-3">
        {beverage.imageUrl ? (
          // Plain <img>: these are third-party product shots of unknown size and
          // the optimiser buys us nothing for a handful of thumbnails.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={beverage.imageUrl}
            alt=""
            className="h-24 w-20 shrink-0 rounded-xl bg-night-800 object-contain"
          />
        ) : (
          <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-xl bg-night-800 text-3xl">
            🍺
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{beverage.name}</h2>
          {beverage.brand && <p className="text-sm text-foam/60">{beverage.brand}</p>}
          {meta && <p className="mt-1 text-sm text-foam/50">{meta}</p>}
          <p className="mt-1 text-xs text-foam/35">
            {perServing ? `${perServing} per serving` : "No ABV/volume — counts as a drink only"}
          </p>
          {beverage.barcode && (
            <p className="mt-1 font-mono text-xs text-foam/30">{beverage.barcode}</p>
          )}
        </div>
      </div>

      {looksSuspicious && (
        <p
          role="alert"
          className="mt-3 rounded-2xl border border-amber-deep/60 bg-night-900 px-4 py-3 text-sm text-amber-glow"
        >
          Open Food Facts didn&apos;t recognise this as a drink. Check the name before saving — or{" "}
          <Link href={`/add?barcode=${beverage.barcode ?? ""}`} className="underline">
            enter it by hand
          </Link>
          .
        </p>
      )}

      <div className="mt-4">
        <LogDrinkForm beverageId={beverage.id}>
          <QuantityStepper />
        </LogDrinkForm>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          href="/scan"
          className="tap flex items-center justify-center rounded-2xl border border-night-700 text-sm font-medium"
        >
          Scan another
        </Link>
        <Link
          href="/"
          className="tap flex items-center justify-center rounded-2xl border border-night-700 text-sm font-medium"
        >
          Cancel
        </Link>
      </div>
    </AppShell>
  );
}
