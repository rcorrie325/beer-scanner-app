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

  const beverages = await searchBeverages("");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-1 text-xl font-bold">
        {barcode ? "New beverage" : "Log without the camera"}
      </h1>
      <p className="mb-4 text-sm text-foam/50">
        {barcode
          ? "We didn't recognise that barcode — tell us what it is."
          : "Search the catalog or anything the group has logged, or add a new one."}
      </p>

      {!barcode && (
        <section className="mb-8">
          <BeverageSearch initial={beverages} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
          Add a new beverage
        </h2>
        <NewBeverageForm barcode={barcode} brandHint={brandHint} />
      </section>
    </AppShell>
  );
}
