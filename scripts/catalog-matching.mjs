/**
 * The rules that decide whether an Open Food Facts product really is the beer a
 * catalog entry describes.
 *
 * Split out from `build-beer-catalog.mjs` so they can be tested without a
 * network call. Getting these wrong is expensive in both directions: too loose
 * and a barcode gets attached to the wrong beer, which the app will then trust
 * forever without ever re-checking OFF; too strict and whole brands come back
 * empty, which is how the first build lost every American beer.
 *
 * Everything here is pure.
 */

import { GLOBAL_EXCLUDE } from "./beer-catalog.source.mjs";

/** Categories that mean "this is a drink with alcohol in it". */
const BEER_CATEGORY = /beers?|bi(e|è)res?|cerveza|cerveja|birra|ciders?|cidre|alcoholic|seltzer/i;

/**
 * A beverage row is *one serving*, so any volume outside this window is a
 * multipack, a keg or a data-entry slip and gets replaced by the entry's own
 * serving size. Without this, OFF's `product_quantity` of 1980 for a 6-pack
 * would seed a "Heineken" worth six drinks.
 */
export const MIN_SERVING_ML = 100;
export const MAX_SERVING_ML = 1000;

/** How far OFF's ABV may sit from ours before we distrust the match. */
export const ABV_TOLERANCE = 1.0;

/**
 * ABV as a beer actually states it: one decimal place.
 *
 * Open Food Facts often derives alcohol from grams per 100 ml and hands back
 * 7.49544919156227, which is precision nobody printed on the can. The extra
 * digits change no total that survives rounding for display, so they are just
 * noise in a committed data file.
 */
export function roundAbv(abv) {
  return typeof abv === "number" && Number.isFinite(abv) ? Math.round(abv * 10) / 10 : abv;
}

/**
 * The GTIN check digit, verified.
 *
 * Open Food Facts is crowd-sourced and full of hand-typed codes that are a
 * digit short or a digit wrong — "01818828" sits under Busch. Those are exactly
 * the codes that would sit in the catalog forever shadowing a real beer, and
 * every genuine barcode carries the checksum that catches them.
 *
 * This is a build-time filter only. The app itself doesn't verify check digits:
 * scanner hardware and ZXing already have, and a hand-typed barcode that fails
 * should still be allowed to reach a manual entry.
 */
export function hasValidCheckDigit(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeBarcode(raw) {
  const digits = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 8 || digits.length === 13) return digits;
  return null;
}

/** Lowercase, strip accents and punctuation — the form keywords are matched in. */
export function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%.,'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyBrand(brand) {
  return fold(brand).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const UNIT_TO_ML = [
  [/^(ml|milli ?litres?|milli ?liters?)$/i, 1],
  [/^cl$/i, 10],
  [/^dl$/i, 100],
  [/^(l|litres?|liters?)$/i, 1000],
  [/^(fl ?\.? ?oz|fluid ounces?|oz)$/i, 29.5735],
  [/^(pints?|pt)$/i, 473.176],
];

export function parseVolumeMl(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(fl\.?\s?oz|fluid ounces?|milli ?litres?|milli ?liters?|litres?|liters?|pints?|ml|cl|dl|oz|pt|l)\b/i,
  );
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].replace(/\s+/g, " ").trim();
  const factor = UNIT_TO_ML.find(([pattern]) => pattern.test(unit))?.[1];
  if (factor === undefined) return null;
  const ml = Math.round(value * factor);
  if (ml < 10 || ml > 20000) return null;
  return ml;
}

export function extractAbv(nutriments) {
  if (!nutriments || typeof nutriments !== "object") return null;
  for (const key of ["alcohol_value", "alcohol_100g", "alcohol"]) {
    const raw = nutriments[key];
    const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
    if (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  return null;
}

/**
 * Only the product's names. `quantity` is deliberately left out: it is full of
 * digits ("10 x 33 cl") that would let a numeric keyword like "805" or "10"
 * match the wrong beer.
 */
export function productHaystack(product) {
  return fold(
    [product.product_name, product.product_name_en, product.generic_name]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Rejects products OFF files as something other than a drink.
 *
 * Uncategorised products pass. Most US beers on OFF have an empty
 * `categories_tags` — requiring a beer category there threw away nearly every
 * American brand in the catalog. The keyword rules are what actually identify
 * the beer; this only has to catch the case where a brand sells other things
 * too, and those *are* categorised (Busch the brewery vs Busch the German
 * bakery, whose pastries come tagged `en:meringues`).
 */
export function looksLikeBeer(product) {
  const tags = Array.isArray(product.categories_tags) ? product.categories_tags : [];
  if (tags.length === 0) return true;
  return tags.some((tag) => BEER_CATEGORY.test(String(tag)));
}

/**
 * Keywords match whole words, so "Sol" doesn't claim a *girasol* and
 * "Rochefort 10" doesn't claim a Rochefort 8's 10-pack.
 */
const wordCache = new Map();
export function containsWord(haystack, term) {
  let pattern = wordCache.get(term);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    wordCache.set(term, pattern);
  }
  return pattern.test(haystack);
}

const FOLDED_GLOBAL_EXCLUDE = GLOBAL_EXCLUDE.map(fold);

/**
 * Which of a brand's catalog entries this product is, or null.
 *
 * Excludes are substring-based on purpose: they are the safety net, and "0.0"
 * or "sans alcool" should catch however they are punctuated.
 */
export function matchEntry(product, entries) {
  const haystack = productHaystack(product);
  if (!haystack) return null;
  if (FOLDED_GLOBAL_EXCLUDE.some((term) => haystack.includes(term))) return null;

  const hits = entries.filter((entry) => {
    const excludes = (entry.exclude ?? []).map(fold);
    if (excludes.some((term) => haystack.includes(term))) return false;
    return entry.keywords.map(fold).every((term) => containsWord(haystack, term));
  });

  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];

  // Two entries of the same brand both fit ("Leffe Blonde" vs a hypothetical
  // "Leffe Blonde Reserve"): the more specific one wins, ties are dropped
  // rather than guessed at.
  const score = (entry) => entry.keywords.join("").length;
  const ranked = [...hits].sort((a, b) => score(b) - score(a));
  return score(ranked[0]) > score(ranked[1]) ? ranked[0] : null;
}

/**
 * The serving size to store for one barcode.
 *
 * `quantity` is read first because it is free text and keeps the per-bottle
 * size in a multipack ("6 x 33 cl" -> 330). `product_quantity` is a bare number
 * that, for the same pack, is the 1980 ml total.
 */
export function servingVolumeMl(product, fallbackMl) {
  const candidates = [
    parseVolumeMl(product.quantity),
    product.product_quantity != null
      ? parseVolumeMl(`${product.product_quantity} ${product.product_quantity_unit ?? "ml"}`)
      : null,
  ];
  return (
    candidates.find((ml) => ml !== null && ml >= MIN_SERVING_ML && ml <= MAX_SERVING_ML) ??
    fallbackMl
  );
}

/** The code and facts to store for a product, or null if it isn't this beer. */
export function toCatalogCode(product, entries) {
  if (!looksLikeBeer(product)) return null;

  // EAN-8 is kept, not filtered on length: Mexican brewers really do use it,
  // and dropping 8-digit codes cost the catalog every Corona, Tecate and Dos
  // Equis. The check digit is what separates those from OFF's typos.
  const barcode = normalizeBarcode(product.code);
  if (!barcode || !hasValidCheckDigit(barcode)) return null;

  const entry = matchEntry(product, entries);
  if (!entry) return null;

  // OFF's own figure, where it has one, is the tie-breaker on whether this
  // really is our beer — and then the value we keep, since the same brand is
  // brewed to different strengths for different markets and the barcode is what
  // identifies the market.
  const offAbv = extractAbv(product.nutriments);
  if (offAbv !== null && Math.abs(offAbv - entry.abv) > ABV_TOLERANCE) return null;

  const imageUrl =
    [product.image_front_url, product.image_url].find(
      (url) => typeof url === "string" && url !== "",
    ) ?? null;

  return {
    entry,
    code: {
      barcode,
      abv: offAbv ?? entry.abv,
      volumeMl: servingVolumeMl(product, entry.volumeMl),
      imageUrl,
    },
  };
}
