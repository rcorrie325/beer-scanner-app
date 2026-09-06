import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Scanner } from "@/components/Scanner";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Scan a barcode</h1>
      <Scanner />
    </AppShell>
  );
}
