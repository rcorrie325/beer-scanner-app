import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Scanner } from "@/components/Scanner";

export const dynamic = "force-dynamic";

/**
 * The live camera scanner, kept off the main path because it only works in a
 * secure context — see the note on /scan.
 */
export default async function LiveScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Live camera scanner</h1>
      <Scanner />
    </AppShell>
  );
}
