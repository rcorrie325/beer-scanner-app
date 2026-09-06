/**
 * Turns `scripts/beer-catalog.source.mjs` into `prisma/beer-catalog.json`.
 *
 *   node scripts/build-beer-catalog.mjs [--brand heineken] [--dry]
 *
 * Barcodes are real GTINs — they cannot be derived from a beer's name, and a
 * wrong one is worse than a missing one because it would silently attach the
 * wrong drink (and the wrong ABV) to somebody's scan. So this script never
 * invents one: it asks Open Food Facts which codes it holds for each brand and
 * keeps only those whose product name confirms the specific beer.
 *
 * The rules deciding that live in `scripts/catalog-matching.mjs`, where the
 * test suite can reach them. This file is the network and file plumbing around
 * them: one search per brand, paced under Open Food Facts' rate limit, with the
 * previous run's results kept for any brand that doesn't answer.
 *
 * The output is committed, so seeding needs no network. Re-run this to refresh.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CATALOG } from "./beer-catalog.source.mjs";
import {
  hasValidCheckDigit,
  normalizeBarcode,
  roundAbv,
  slugifyBrand,
  toCatalogCode,
} from "./catalog-matching.mjs";

/**
 * Codes listed as `verifiedBarcodes` on a source entry.
 *
 * The source file's rule is that it holds facts about the beer and never
 * barcodes, because a guessed GTIN silently attaches the wrong drink. A number
 * read off a can in your hand isn't a guess, though, and some beers — Natural
 * Light among them — simply aren't in Open Food Facts with a usable code. This
 * is the narrow exception: hand-checked codes, still put through the same check
 * digit and length rules as anything OFF hands us, so a typo can't get in.
 *
 * ABV and volume deliberately come from the entry rather than being given per
 * code. OFF supplies those per barcode because they vary by market; a code you
 * typed in is for the can you were holding, which is the entry's own serving.
 */
function verifiedCodesFor(entry) {
  const codes = [];
  for (const raw of entry.verifiedBarcodes ?? []) {
    const barcode = normalizeBarcode(String(raw));
    if (!barcode) {
      process.stderr.write(`  ! ${entry.name}: "${raw}" isn't a usable GTIN — skipped\n`);
      continue;
    }
    if (!hasValidCheckDigit(barcode)) {
      process.stderr.write(`  ! ${entry.name}: ${barcode} fails its check digit — skipped\n`);
      continue;
    }
    codes.push({ barcode, abv: entry.abv, volumeMl: entry.volumeMl, imageUrl: null });
  }
  return codes;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(HERE, "..", "prisma", "beer-catalog.json");

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/api/v2/search";
const USER_AGENT = "BeerScannerApp/0.1 (catalog builder; self-hosted party drink tracker)";
const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "categories_tags",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "image_front_url",
  "image_url",
  "nutriments",
].join(",");

/** OFF asks for <= 10 search calls a minute. Stay just inside it. */
const REQUEST_SPACING_MS = 6500;
const PAGE_SIZE = 100;
/**
 * Pages per brand. One is enough: the barcode cap below means a brand's first
 * hundred products already supply more codes than we keep, and search is the
 * rate-limited endpoint — a second page would double a build that is already
 * measured in tens of minutes.
 */
const MAX_PAGES = 1;
/**
 * OFF's search endpoint sheds load by returning a fast 503 at random — under a
 * second, not a timeout. Retries are therefore quick and cheap: what the rate
 * limit cares about is the sustained request rate, which REQUEST_SPACING_MS
 * already governs. Backing off for tens of seconds instead turns a 15-minute
 * build into a two-hour one.
 */
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS = 2000;
/** Barcodes kept per beer — plenty of real-world coverage, no table bloat. */
const MAX_BARCODES_PER_BEER = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

let lastRequestAt = 0;

/**
 * One search, retried past OFF's load-shedding. Returns `failed: true` only
 * when we never got an answer — which is not the same as "this brand has no
 * beers", and the caller has to tell them apart or a bad afternoon at OFF would
 * quietly empty the catalog.
 */
async function offSearch(params) {
  const url = `${OFF_SEARCH_URL}?${new URLSearchParams({
    ...params,
    fields: FIELDS,
    page_size: String(PAGE_SIZE),
  })}`;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const wait = REQUEST_SPACING_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);

    lastRequestAt = Date.now();
    let response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      await sleep(RETRY_BASE_MS * attempt);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      await sleep(RETRY_BASE_MS * attempt);
      continue;
    }
    // A 4xx is a bad query, not congestion — retrying it changes nothing.
    if (!response.ok) return { products: [], failed: true };

    try {
      const body = await response.json();
      return { products: Array.isArray(body?.products) ? body.products : [], failed: false };
    } catch {
      return { products: [], failed: true };
    }
  }

  return { products: [], failed: true };
}

/** Everything OFF holds for a brand, up to MAX_PAGES pages of it. */
async function fetchBrandProducts(brandSlug) {
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { products: batch, failed } = await offSearch({
      brands_tags: brandSlug,
      page: String(page),
    });
    // Losing page 2 still leaves page 1 worth keeping; losing page 1 means we
    // learned nothing about this brand at all.
    if (failed) return { products, failed: page === 1 };
    products.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { products, failed: false };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const brandFilter = (() => {
  const i = args.indexOf("--brand");
  return i >= 0 ? args[i + 1] : null;
})();

// Entries are grouped by OFF brand slug so each brand costs one round trip
// regardless of how many of its beers we carry.
const byBrand = new Map();
for (const entry of CATALOG) {
  const slug = entry.offBrand ?? slugifyBrand(entry.brand);
  if (brandFilter && slug !== brandFilter) continue;
  if (!byBrand.has(slug)) byBrand.set(slug, []);
  byBrand.get(slug).push(entry);
}

// Keep whatever a previous run found: an OFF hiccup on one brand should degrade
// that brand to "no new codes", never wipe the file.
let previous = { entries: [] };
try {
  previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
} catch {
  /* first run */
}
const previousByName = new Map((previous.entries ?? []).map((e) => [e.name, e]));

const results = [];
let brandIndex = 0;
const totalBrands = byBrand.size;

for (const [slug, entries] of byBrand) {
  brandIndex += 1;
  process.stderr.write(`[${brandIndex}/${totalBrands}] ${slug} … `);

  const { products, failed } = await fetchBrandProducts(slug);
  if (failed) process.stderr.write("Open Food Facts never answered — keeping previous codes\n");

  const found = new Map(entries.map((e) => [e.name, new Map()]));
  for (const product of products) {
    const match = toCatalogCode(product, entries);
    if (match) found.get(match.entry.name).set(match.code.barcode, match.code);
  }

  let kept = 0;
  for (const entry of entries) {
    const fresh = [...found.get(entry.name).values()]
      // Codes carrying a product shot sort first, so the cap keeps the rows
      // that render nicely on the confirm screen.
      .sort(
        (a, b) =>
          Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) ||
          a.barcode.localeCompare(b.barcode),
      )
      .slice(0, MAX_BARCODES_PER_BEER);

    // A brand whose fetch failed keeps its previous codes untouched.
    const discovered =
      failed || fresh.length === 0 ? (previousByName.get(entry.name)?.barcodes ?? []) : fresh;

    // Codes a human read off a physical can outrank anything found by search,
    // and survive a brand OFF has nothing usable for. They're deduped against
    // the discovered set so a code that later shows up in OFF doesn't double.
    const verified = verifiedCodesFor(entry);
    const seen = new Set(verified.map((c) => c.barcode));
    const codes = [...verified, ...discovered.filter((c) => !seen.has(c.barcode))];
    kept += codes.length;

    results.push({
      name: entry.name,
      brand: entry.brand,
      style: entry.style,
      abv: entry.abv,
      volumeMl: entry.volumeMl,
      barcodes: codes,
    });
  }

  if (!failed) process.stderr.write(`${products.length} products → ${kept} barcodes\n`);
}

// Entries outside the --brand filter keep whatever the last full run produced.
if (brandFilter) {
  const touched = new Set(results.map((r) => r.name));
  for (const entry of previous.entries ?? []) {
    if (!touched.has(entry.name)) results.push(entry);
  }
}

results.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

// Applied here rather than at match time so that *any* run — including a
// one-brand refresh — rewrites the whole file to one decimal place, entries
// carried over from a previous build included.
for (const entry of results) {
  entry.barcodes = entry.barcodes.map((code) => ({ ...code, abv: roundAbv(code.abv) }));
}

const totalBarcodes = results.reduce((sum, e) => sum + e.barcodes.length, 0);
const withNone = results.filter((e) => e.barcodes.length === 0);

const output = {
  $comment:
    "Generated by scripts/build-beer-catalog.mjs. Barcodes come from Open Food Facts, " +
    "not from guesswork — edit scripts/beer-catalog.source.mjs and re-run instead of " +
    "hand-editing this file.",
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "Open Food Facts (openfoodfacts.org), ODbL",
  beerCount: results.length,
  barcodeCount: totalBarcodes,
  entries: results,
};

if (dryRun) {
  process.stderr.write(`\nDRY RUN — ${results.length} beers, ${totalBarcodes} barcodes\n`);
} else {
  await writeFile(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  process.stderr.write(`\nWrote ${OUT_PATH}\n${results.length} beers, ${totalBarcodes} barcodes\n`);
}

if (withNone.length > 0) {
  process.stderr.write(
    `${withNone.length} with no barcode (searchable, but won't match a scan):\n` +
      withNone.map((e) => `  - ${e.name}`).join("\n") +
      "\n",
  );
}
