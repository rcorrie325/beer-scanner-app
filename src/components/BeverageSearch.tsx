"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { beverageMeta } from "@/lib/format";
import type { BeverageListItem } from "@/lib/queries";

/**
 * The camera-free path. Everything the group has ever logged is here, plus the
 * seeded catalog of common beers, so at a party you mostly just tap the beer
 * you had ten minutes ago — and the one you're holding is usually there even on
 * the first night.
 */
export function BeverageSearch({ initial }: { initial: BeverageListItem[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BeverageListItem[]>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim() === "") {
      setResults(initial);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/beverages?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { beverages: BeverageListItem[] };
        setResults(data.beverages);
      } catch {
        // Aborted or offline — keep whatever is on screen.
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, initial]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search beers — Guinness, IPA, Modelo…"
        aria-label="Search beverages"
        className="tap w-full rounded-2xl border border-night-700 bg-night-900 px-4 text-base outline-none placeholder:text-foam/30 focus:border-amber-glow"
      />

      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-night-700 px-4 py-6 text-center text-sm text-foam/50">
          {loading ? "Searching…" : "Nothing matches. Add it below."}
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((beverage) => {
            const meta = beverageMeta(beverage);
            return (
              <li key={beverage.id}>
                <Link
                  href={`/confirm/${beverage.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-night-800 bg-night-900 px-3 py-2.5 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{beverage.name}</p>
                    <p className="truncate text-xs text-foam/50">
                      {[beverage.brand, meta].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-foam/40">
                    {beverage.logCount > 0 ? `${beverage.logCount} logged` : "not yet"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
