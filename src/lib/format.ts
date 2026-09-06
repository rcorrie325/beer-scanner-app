import { standardDrinks } from "@/lib/standard-drinks";

type BeverageLike = {
  style?: string | null;
  abv?: number | null;
  volumeMl?: number | null;
};

/** "IPA · 5.6% · 330 ml", skipping whatever we don't know. */
export function beverageMeta(b: BeverageLike): string {
  const parts: string[] = [];
  if (b.style) parts.push(b.style);
  if (typeof b.abv === "number") parts.push(`${trimNumber(b.abv)}%`);
  if (typeof b.volumeMl === "number") parts.push(`${b.volumeMl} ml`);
  return parts.join(" · ");
}

/** "1.2 std" per serving, or null when ABV or volume is missing. */
export function perServingStandardDrinks(b: BeverageLike): string | null {
  const sd = standardDrinks({ abv: b.abv, volumeMl: b.volumeMl }, 1);
  return sd === null ? null : `${sd.toFixed(1)} std`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
