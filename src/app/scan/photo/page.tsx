import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PhotoScanner } from "@/components/PhotoScanner";

export const dynamic = "force-dynamic";

export default async function PhotoScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Photo a barcode</h1>
      <PhotoScanner />
    </AppShell>
  );
}
