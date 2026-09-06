import Link from "next/link";
import { switchUserAction } from "@/actions/users";
import { BottomNav } from "@/components/BottomNav";

type Props = {
  displayName: string;
  children: React.ReactNode;
  showNav?: boolean;
};

export function AppShell({ displayName, children, showNav = true }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-20 border-b border-night-800 bg-night-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span aria-hidden>🍺</span>
            <span>Beer Scanner</span>
          </Link>
          <form action={switchUserAction}>
            <button
              type="submit"
              className="rounded-full border border-night-700 px-3 py-1.5 text-xs font-medium text-foam/70 transition active:scale-95"
            >
              {displayName} · switch
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 pb-6 pt-4">{children}</main>

      {showNav && <BottomNav />}
    </div>
  );
}
