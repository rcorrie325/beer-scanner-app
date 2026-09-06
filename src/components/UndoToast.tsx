"use client";

import { useEffect, useState } from "react";
import { undoLogAction } from "@/actions/logs";

/**
 * Appears right after a drink is saved. The log id comes in on the URL
 * (`/?undo=<id>`), so this survives a refresh and needs no client state store.
 * It fades itself out after a few seconds; the recent-drinks list keeps a
 * permanent undo on the newest entry, so nothing is lost when it goes.
 */
export function UndoToast({ logId, label }: { logId: string; label: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [logId]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="animate-rise safe-bottom pointer-events-none fixed inset-x-0 bottom-16 z-30 px-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-night-700 bg-night-800 px-4 py-3 shadow-lg">
        <span className="flex-1 truncate text-sm">
          Logged <strong className="font-semibold">{label}</strong>
        </span>
        <form action={undoLogAction}>
          <input type="hidden" name="logId" value={logId} />
          <button
            type="submit"
            className="rounded-xl bg-amber-glow px-3 py-2 text-sm font-semibold text-night-950 active:scale-95"
          >
            Undo
          </button>
        </form>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
          className="px-1 text-lg leading-none text-foam/50"
        >
          ×
        </button>
      </div>
    </div>
  );
}
