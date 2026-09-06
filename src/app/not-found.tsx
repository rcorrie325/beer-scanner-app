import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl" aria-hidden>
        🍺
      </p>
      <h1 className="text-2xl font-bold">Nothing here</h1>
      <p className="text-foam/60">That drink or page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="tap flex items-center justify-center rounded-2xl bg-amber-glow px-6 font-semibold text-night-950"
      >
        Back to the tally
      </Link>
    </div>
  );
}
