/**
 * Open Food Facts lookup.
 *
 * Free, no API key, decent beer coverage. Three outcomes the rest of the app
 * has to cope with, so they are modelled explicitly rather than as
 * exceptions-or-null:
 *
 *   hit    — we got a product with at least a usable name
 *   miss   — OFF answered, but doesn't know this barcode (or has nothing usable)
 *   error  — OFF was unreachable, slow, or returned something we can't parse
 *
 * "miss" sends the user to the manual form. "error" tells the user the lookup
 * failed and *also* offers the manual form — a flaky network must never be a
 * dead end at a party.
 */

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
const OFF_TIMEOUT_MS = 6000;

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "categories",
  "categories_tags",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "serving_size",
  "image_front_url",
  "image_url",
  "nutriments",
].join(",");

// Open Food Facts asks API clients to identify themselves.
const USER_AGENT = "BeerScannerApp/0.1 (self-hosted party drink tracker)";

export type MappedProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  style: string | null;
  abv: number | null;
  volumeMl: number | null;
  imageUrl: string | null;
  /**
   * False when OFF's categories don't look like a drink with alcohol in it —
   * someone scanned the crisps. We still let them log it, but the confirm
   * screen warns first.
   */
  looksAlcoholic: boolean;
  /** Best guess at what OFF thinks this is, for the "that's not a beer" warning. */
  categoryLabel: string | null;
};

export type LookupResult =
  | { status: "hit"; product: MappedProduct }
  | { status: "miss" }
  | { status: "error"; reason: string };

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/* -------------------------------------------------------------------------- */
/* Field mapping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Checked in order, most specific first, so "india pale ale" wins over "ale"
 * and "ale" wins over the catch-all "beer". Every pattern tolerates the plural
 * because OFF's category tags are plural ("en:stouts", "en:lagers").
 */
const STYLE_PATTERNS: Array<[RegExp, string]> = [
  [/non[- ]?alcoholic|alcohol[- ]?free|sans[- ]?alcool/i, "Non-alcoholic"],
  [/india[- ]?pale[- ]?ales?\b|\bipas?\b|\bnepa\b|\bhazy\b/i, "IPA"],
  [/imperial[- ]?stouts?\b|\bstouts?\b/i, "Stout"],
  [/\bporters?\b/i, "Porter"],
  [/\bpils(e?ners?)?\b/i, "Pilsner"],
  [/weiss|weizen|hefe|witbiers?\b|\bwheat\b|blanche/i, "Wheat"],
  [/\bsours?\b|\bgose\b|\blambics?\b|geuze|berliner/i, "Sour"],
  [/\bsaisons?\b|farmhouse/i, "Saison"],
  [/pale[- ]?ales?\b/i, "Pale Ale"],
  [/brown[- ]?ales?\b|\bbitters?\b|\bmild\b/i, "Brown Ale"],
  [/\btrappist\b|\babbeys?\b|dubbels?\b|tripels?\b|quadrupels?\b/i, "Belgian"],
  [/\bambers?\b|\bred[- ]?ales?\b/i, "Amber"],
  [/\bciders?\b|\bcidres?\b|\bsidra\b/i, "Cider"],
  [/\blagers?\b|\bhelles\b|\bdunkels?\b|m(a|ä)rzen|\bbocks?\b/i, "Lager"],
  [/\bales?\b/i, "Ale"],
  [/\bbeers?\b|bi(e|è)res?\b|\bcervezas?\b|\bcervejas?\b|\bbirras?\b/i, "Beer"],
];

/** Tags that mean "there is alcohol in this". */
const ALCOHOL_TAG_PATTERNS = [
  /alcoholic[- ]?bever/i,
  /\bbeers?\b/i,
  /bi(e|è)res/i,
  /cerveza|cerveja|birra/i,
  /\bciders?\b|cidre/i,
  /\bales?\b/i,
  /\blagers?\b/i,
  /\bstouts?\b/i,
];

const NON_ALCOHOLIC_TAG_PATTERNS = [
  /non[- ]?alcoholic/i,
  /alcohol[- ]?free/i,
  /sans[- ]?alcool/i,
];

/** Strips OFF's "en:" / "fr:" language prefixes and tidies hyphens. */
function cleanTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").trim();
}

export function deriveStyle(
  categoriesTags: string[],
  categories: string | null,
  productName: string | null,
): string | null {
  const haystacks = [
    ...categoriesTags.map(cleanTag),
    ...(categories ? categories.split(",").map((c) => c.trim()) : []),
    productName ?? "",
  ].filter(Boolean);

  for (const [pattern, style] of STYLE_PATTERNS) {
    if (haystacks.some((h) => pattern.test(h))) return style;
  }
  return null;
}

export function looksAlcoholic(categoriesTags: string[], categories: string | null): boolean {
  const haystacks = [
    ...categoriesTags.map(cleanTag),
    ...(categories ? categories.split(",").map((c) => c.trim()) : []),
  ];
  if (haystacks.length === 0) return false;
  if (haystacks.some((h) => NON_ALCOHOLIC_TAG_PATTERNS.some((p) => p.test(h)))) return false;
  return haystacks.some((h) => ALCOHOL_TAG_PATTERNS.some((p) => p.test(h)));
}

const UNIT_TO_ML: Array<[RegExp, number]> = [
  [/^(ml|milli ?litres?|milli ?liters?)$/i, 1],
  [/^cl$/i, 10],
  [/^dl$/i, 100],
  [/^(l|litres?|liters?)$/i, 1000],
  [/^(fl ?\.? ?oz|fluid ounces?|oz)$/i, 29.5735],
  [/^(pints?|pt)$/i, 473.176],
];

/**
 * Parses OFF's free-text `quantity` field: "330 ml", "0,33 L", "12 fl oz",
 * "6 x 33 cl", "500ml". Multipacks yield the *per-bottle* volume, which is what
 * you actually drink at a time.
 */
export function parseVolumeMl(raw: string | null | undefined): number | null {
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
  // Anything outside this range is a data-entry accident, not a serving.
  if (ml < 10 || ml > 20000) return null;
  return ml;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function extractAbv(nutriments: Record<string, unknown> | null): number | null {
  if (!nutriments) return null;
  for (const key of ["alcohol_value", "alcohol_100g", "alcohol", "alcohol_serving"]) {
    const n = asFiniteNumber(nutriments[key]);
    if (n !== null && n > 0 && n <= 100) return n;
  }
  return null;
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Maps a raw OFF `product` object onto Beverage fields. Null if unusable. */
export function mapProduct(barcode: string, raw: unknown): MappedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  const name = firstNonEmpty(p.product_name, p.product_name_en, p.generic_name);
  // A product with no name is useless to us — treat it as a miss and let the
  // user type it in.
  if (!name) return null;

  const brands = firstNonEmpty(p.brands);
  const brand = brands ? brands.split(",")[0].trim() : null;

  const categoriesTags = Array.isArray(p.categories_tags)
    ? (p.categories_tags.filter((t) => typeof t === "string") as string[])
    : [];
  const categories = firstNonEmpty(p.categories);

  const productQuantity = asFiniteNumber(p.product_quantity);
  const productQuantityUnit = firstNonEmpty(p.product_quantity_unit);
  const volumeMl =
    productQuantity !== null
      ? parseVolumeMl(`${productQuantity} ${productQuantityUnit ?? "ml"}`)
      : null;

  const nutriments =
    p.nutriments && typeof p.nutriments === "object"
      ? (p.nutriments as Record<string, unknown>)
      : null;

  return {
    barcode,
    name,
    brand,
    style: deriveStyle(categoriesTags, categories, name),
    abv: extractAbv(nutriments),
    volumeMl:
      volumeMl ??
      parseVolumeMl(firstNonEmpty(p.quantity)) ??
      parseVolumeMl(firstNonEmpty(p.serving_size)),
    imageUrl: firstNonEmpty(p.image_front_url, p.image_url),
    looksAlcoholic: looksAlcoholic(categoriesTags, categories),
    categoryLabel: categoriesTags.length ? cleanTag(categoriesTags[categoriesTags.length - 1]) : categories,
  };
}

/* -------------------------------------------------------------------------- */
/* Network                                                                    */
/* -------------------------------------------------------------------------- */

export type LookupOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
};

export async function lookupBarcode(
  barcode: string,
  options: LookupOptions = {},
): Promise<LookupResult> {
  const {
    fetchImpl = globalThis.fetch as unknown as FetchLike,
    timeoutMs = OFF_TIMEOUT_MS,
    baseUrl = OFF_BASE_URL,
  } = options;

  if (typeof fetchImpl !== "function") {
    return { status: "error", reason: "No fetch implementation available" };
  }

  const url = `${baseUrl}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "Open Food Facts timed out"
        : `Open Food Facts is unreachable${error instanceof Error ? `: ${error.message}` : ""}`;
    return { status: "error", reason };
  }

  // OFF answers 404 for barcodes it has never seen. That's a miss, not a fault.
  if (response.status === 404) return { status: "miss" };
  if (!response.ok) {
    return { status: "error", reason: `Open Food Facts returned HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", reason: "Open Food Facts returned malformed JSON" };
  }

  if (!body || typeof body !== "object") {
    return { status: "error", reason: "Open Food Facts returned an unexpected payload" };
  }

  const envelope = body as Record<string, unknown>;
  // v2 uses status: 1 (found) / 0 (not found).
  if (envelope.status === 0 || envelope.status === "0") return { status: "miss" };
  if (!envelope.product) return { status: "miss" };

  const product = mapProduct(barcode, envelope.product);
  if (!product) return { status: "miss" };

  return { status: "hit", product };
}
