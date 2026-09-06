/**
 * Loads `prisma/beer-catalog.json` into the Beverage table.
 *
 *   npm run db:seed
 *
 * Why seed at all, when scanning already falls back to a live Open Food Facts
 * lookup? Because the lookup is the part that breaks. Seeded rows resolve from
 * the local database in milliseconds with no network, which is exactly the
 * situation the app runs in — a phone on a crowded guest wifi, six people
 * scanning at once, OFF occasionally timing out. Seeding also lets us pin an
 * ABV and a single-serving volume per barcode, so the standard-drink maths
 * works on the first scan instead of showing "no ABV data".
 *
 * Three rules keep re-running safe:
 *   - rows the catalog doesn't own (source "scan" or "manual") are never
 *     touched, so a beer somebody corrected by hand stays corrected;
 *   - rows the catalog does own are refreshed, so fixing an ABV in the catalog
 *     and re-seeding actually takes effect;
 *   - catalog rows that have dropped out of the JSON are cleared away, but only
 *     while nothing has been logged against them. A row with drinks on it stays
 *     forever: deleting it would cascade those logs off the leaderboard.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(HERE, "beer-catalog.json");

/** Marks a Beverage row as owned by the catalog rather than by a user. */
const CATALOG_SOURCE = "catalog";

const prisma = new PrismaClient();

/** Flattens the catalog's beer-with-many-barcodes shape into one row per barcode. */
function toRows(catalog) {
  const rows = new Map();

  for (const entry of catalog.entries ?? []) {
    for (const code of entry.barcodes ?? []) {
      // A barcode is unique in the table, so a code claimed by two beers (bad
      // catalog data) must not produce two conflicting rows. First wins.
      if (rows.has(code.barcode)) continue;
      rows.set(code.barcode, {
        barcode: code.barcode,
        name: entry.name,
        brand: entry.brand,
        style: entry.style,
        abv: code.abv ?? entry.abv,
        volumeMl: code.volumeMl ?? entry.volumeMl,
        imageUrl: code.imageUrl ?? null,
        source: CATALOG_SOURCE,
      });
    }
  }

  return [...rows.values()];
}

/**
 * Catalog beers Open Food Facts has no usable barcode for.
 *
 * Without these they'd be invisible: `toRows` emits one row per barcode, so a
 * beer with none produces nothing and the app simply doesn't have it — you
 * couldn't scan it, and you couldn't find it by name either. A row with a null
 * barcode makes the beer searchable with its curated ABV and style, and gives a
 * scan somewhere to attach a real code to (see `attachBarcodeAction`), which is
 * how the gap actually gets filled: off the can in someone's hand, which beats
 * any product database.
 *
 * `barcode` is nullable and unique; SQL lets a unique index hold many nulls, so
 * these don't collide.
 */
function toPlaceholders(catalog) {
  return (catalog.entries ?? [])
    .filter((entry) => (entry.barcodes ?? []).length === 0)
    .map((entry) => ({
      barcode: null,
      name: entry.name,
      brand: entry.brand,
      style: entry.style,
      abv: entry.abv,
      volumeMl: entry.volumeMl,
      imageUrl: null,
      source: CATALOG_SOURCE,
    }));
}

async function main() {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  } catch (error) {
    console.error(
      `Couldn't read ${CATALOG_PATH}. Run \`node scripts/build-beer-catalog.mjs\` first.\n${error.message}`,
    );
    process.exitCode = 1;
    return;
  }

  const rows = toRows(catalog);
  if (rows.length === 0) {
    console.log("Catalog is empty — nothing to seed.");
    return;
  }

  const existing = await prisma.beverage.findMany({
    where: { barcode: { in: rows.map((r) => r.barcode) } },
    select: { barcode: true, source: true },
  });
  const bySource = new Map(existing.map((b) => [b.barcode, b.source]));

  const toCreate = rows.filter((r) => !bySource.has(r.barcode));
  const toRefresh = rows.filter((r) => bySource.get(r.barcode) === CATALOG_SOURCE);
  const userOwned = rows.length - toCreate.length - toRefresh.length;

  if (toCreate.length > 0) {
    // Chunked: SQLite caps the number of bound parameters in one statement.
    for (let i = 0; i < toCreate.length; i += 200) {
      await prisma.beverage.createMany({ data: toCreate.slice(i, i + 200) });
    }
  }

  let refreshed = 0;
  for (const row of toRefresh) {
    const { barcode, ...data } = row;
    const result = await prisma.beverage.updateMany({
      where: { barcode, source: CATALOG_SOURCE },
      data,
    });
    refreshed += result.count;
  }

  // Barcode-less beers are keyed by name rather than by code, and only appear
  // when nothing already carries that name. Once a scan attaches a real barcode
  // the row stops being ours (source flips to "manual"), so this must not then
  // put the placeholder back and leave the beer listed twice.
  const placeholders = toPlaceholders(catalog);
  const named = await prisma.beverage.findMany({
    where: { name: { in: placeholders.map((p) => p.name) } },
    select: { name: true, barcode: true, source: true },
  });
  const takenNames = new Set(named.map((b) => b.name));

  const placeholdersToCreate = placeholders.filter((p) => !takenNames.has(p.name));
  if (placeholdersToCreate.length > 0) {
    await prisma.beverage.createMany({ data: placeholdersToCreate });
  }

  // Existing placeholders still get their curated details refreshed, the same
  // way barcoded catalog rows do.
  let placeholdersRefreshed = 0;
  for (const row of placeholders) {
    const { barcode: _ignored, ...data } = row;
    const result = await prisma.beverage.updateMany({
      where: { name: row.name, barcode: null, source: CATALOG_SOURCE },
      data,
    });
    placeholdersRefreshed += result.count;
  }

  // Rebuilding the catalog drops codes as well as adding them — a barcode whose
  // check digit turned out to be wrong, a beer reassigned to another entry.
  // Without this, every rebuild would leave its rejects behind for good.
  const stale = await prisma.beverage.findMany({
    where: {
      source: CATALOG_SOURCE,
      barcode: { notIn: rows.map((r) => r.barcode) },
      // Any log at all, including soft-deleted ones: an undo has to stay
      // undoable, and undo resurrects the log.
      drinkLogs: { none: {} },
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.beverage.deleteMany({ where: { id: { in: stale.map((b) => b.id) } } });
  }

  // A placeholder whose beer has since gained catalog barcodes, or left the
  // catalog entirely, is now clutter — but only removable while unused.
  const placeholderNames = new Set(placeholders.map((p) => p.name));
  const orphaned = await prisma.beverage.findMany({
    where: { source: CATALOG_SOURCE, barcode: null, drinkLogs: { none: {} } },
    select: { id: true, name: true },
  });
  const toDrop = orphaned.filter((b) => !placeholderNames.has(b.name));
  if (toDrop.length > 0) {
    await prisma.beverage.deleteMany({ where: { id: { in: toDrop.map((b) => b.id) } } });
  }

  console.log(
    `Seeded ${catalog.entries?.length ?? 0} beers as ${rows.length} barcodes: ` +
      `${toCreate.length} added, ${refreshed} refreshed, ${stale.length} stale removed, ` +
      `${userOwned} left alone (user-owned).`,
  );
  console.log(
    `Barcode-less beers: ${placeholdersToCreate.length} added, ` +
      `${placeholdersRefreshed} refreshed, ${toDrop.length} removed. ` +
      `Searchable now; a scan can attach a real code.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
