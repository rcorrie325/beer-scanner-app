"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl" aria-hidden>
        🫗
      </p>
      <h1 className="text-2xl font-bold">Something spilled</h1>
      <p className="text-foam/60">
        The app hit an error. Your logged drinks are safe — nothing is lost.
      </p>
      <button
        type="button"
        onClick={reset}
        className="tap flex items-center justify-center rounded-2xl bg-amber-glow px-6 font-semibold text-night-950"
      >
        Try again
      </button>
    </div>
  );
}
