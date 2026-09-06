import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { searchBeverages } from "@/lib/queries";
import { normalizeBarcode } from "@/lib/barcode";
import { AppShell } from "@/components/AppShell";
import { BeverageSearch } from "@/components/BeverageSearch";
import { NewBeverageForm } from "@/components/NewBeverageForm";

export const dynamic = "force-dynamic";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string; brand?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { barcode: rawBarcode, brand: rawBrand } = await searchParams;
  const barcode = rawBarcode ? (normalizeBarcode(rawBarcode) ?? undefined) : undefined;
  // The brand guess arrives in the URL, so it is trimmed to the same length the
  // form accepts before it is rendered back into an input.
  const brandHint = rawBrand?.trim().slice(0, 60) || undefined;

  // Seeding the catalog's barcode-less beers means the one being scanned is
  // often already listed, just without a code. Leading with the brand guess
  // puts it at the top of the list rather than leaving it to be searched for.
  const beverages = await searchBeverages(barcode && brandHint ? brandHint : "");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-1 text-xl font-bold">
        {barcode ? "Which beer is it?" : "Log without the camera"}
      </h1>
      <p className="mb-4 text-sm text-foam/50">
        {barcode
          ? "We don't know that barcode yet. Pick the beer and we'll remember it for next time."
          : "Search the catalog or anything the group has logged, or add a new one."}
      </p>

      <section className="mb-8">
        {/*
         * The search used to be hidden whenever a barcode was present, which
         * left the only route a full retype — and that made a second row for a
         * beer already in the catalog instead of teaching the one that was
         * there. Tapping a result attaches the code to it instead.
         */}
        <BeverageSearch initial={beverages} attachBarcode={barcode} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
          {barcode ? "Not listed? Add it" : "Add a new beverage"}
        </h2>
        <NewBeverageForm barcode={barcode} brandHint={brandHint} />
      </section>
    </AppShell>
  );
}
