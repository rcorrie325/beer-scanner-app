/**
 * Why did this brand come back with no barcodes?
 *
 *   node scripts/probe-brand.mjs samuel-adams yuengling
 *
 * Prints what Open Food Facts holds under each brand slug and, for every
 * product, which catalog rule turned it away. Use it when a beer you expect to
 * be scannable isn't: the answer is almost always a brand slug OFF files
 * differently, keywords that don't appear in OFF's product name, or OFF simply
 * not having the beer. The first two are fixable in
 * `scripts/beer-catalog.source.mjs`; the third isn't.
 *
 * Read-only — it never writes the catalog.
 */

import { CATALOG } from "./beer-catalog.source.mjs";
import {
  ABV_TOLERANCE,
  extractAbv,
  hasValidCheckDigit,
  looksLikeBeer,
  matchEntry,
  normalizeBarcode,
  slugifyBrand,
} from "./catalog-matching.mjs";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/api/v2/search";
const USER_AGENT = "BeerScannerApp/0.1 (catalog probe; self-hosted party drink tracker)";
const FIELDS =
  "code,product_name,product_name_en,generic_name,brands,categories_tags,quantity,nutriments";
const SPACING_MS = 6500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Why this product isn't in the catalog, or null if it is. */
function rejection(product, entries) {
  if (!looksLikeBeer(product)) {
    return `category ${JSON.stringify((product.categories_tags ?? []).slice(-2))}`;
  }
  const barcode = normalizeBarcode(product.code);
  if (!barcode) return `barcode ${JSON.stringify(product.code)} unusable`;
  if (!hasValidCheckDigit(barcode)) return `barcode ${barcode} fails its check digit`;

  const entry = matchEntry(product, entries);
  if (!entry) return "no keyword match";

  const offAbv = extractAbv(product.nutriments);
  if (offAbv !== null && Math.abs(offAbv - entry.abv) > ABV_TOLERANCE) {
    return `ABV ${offAbv} vs expected ${entry.abv}`;
  }
  return null;
}

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error("Usage: node scripts/probe-brand.mjs <off-brand-slug> [...]");
  process.exit(1);
}

for (const [index, slug] of slugs.entries()) {
  if (index > 0) await sleep(SPACING_MS);

  const entries = CATALOG.filter((e) => (e.offBrand ?? slugifyBrand(e.brand)) === slug);
  console.log(`\n=== ${slug} — catalog wants: ${entries.map((e) => e.name).join(", ") || "(nothing)"}`);

  const url = `${OFF_SEARCH_URL}?brands_tags=${encodeURIComponent(slug)}&fields=${FIELDS}&page_size=100`;

  // OFF sheds load with a fast 503, so retry the same way the builder does.
  let products = null;
  for (let attempt = 1; attempt <= 5 && products === null; attempt += 1) {
    if (attempt > 1) await sleep(SPACING_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) products = (await response.json()).products ?? [];
      else if (response.status < 500 && response.status !== 429) {
        console.log(`  HTTP ${response.status}`);
        break;
      }
    } catch (error) {
      console.log(`  request failed: ${error.message}`);
    }
  }
  if (products === null) {
    console.log("  Open Food Facts never answered");
    continue;
  }

  console.log(`  ${products.length} products`);
  for (const product of products.slice(0, 30)) {
    const why = rejection(product, entries);
    console.log(`  ${why ? "✗" : "✓"} ${JSON.stringify(product.product_name)}${why ? ` — ${why}` : ""}`);
  }
}
