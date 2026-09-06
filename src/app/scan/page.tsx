import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PhotoScanner } from "@/components/PhotoScanner";

export const dynamic = "force-dynamic";

/**
 * The default scanner: take a photo, decode it on the server.
 *
 * This is the one on the nav because it works everywhere. The live camera
 * needs a secure context, which over a LAN means a certificate on every phone;
 * a file input doesn't, so this runs over plain HTTP. The live scanner is still
 * there at /scan/live for anyone who'd rather have the instant read.
 */
export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  return (
    <AppShell displayName={user.displayName}>
      <h1 className="mb-3 text-xl font-bold">Scan a barcode</h1>
      <PhotoScanner />
    </AppShell>
  );
}
