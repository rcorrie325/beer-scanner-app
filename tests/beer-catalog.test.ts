import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { companyPrefixes, normalizeBarcode } from "@/lib/barcode";
import { hasAlcoholData, standardDrinks } from "@/lib/standard-drinks";
// Build tooling, not app code: plain JS, inferred by `allowJs`.
import { hasValidCheckDigit } from "../scripts/catalog-matching.mjs";

/**
 * The seeded catalog short-circuits the Open Food Facts lookup: once a barcode
 * is in the table, nothing ever checks it against OFF again. That makes bad
 * catalog data permanent and invisible, so it is checked here rather than
 * trusted — every row has to be a scannable barcode carrying one plausible
 * serving of one beer.
 */

type CatalogCode = {
  barcode: string;
  abv: number | null;
  volumeMl: number | null;
  imageUrl: string | null;
};

type CatalogEntry = {
  name: string;
  brand: string;
  style: string;
  abv: number;
  volumeMl: number;
  barcodes: CatalogCode[];
};

const catalog = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma", "beer-catalog.json"), "utf8"),
) as { entries: CatalogEntry[] };

const allCodes = catalog.entries.flatMap((entry) =>
  entry.barcodes.map((code) => ({ entry, code })),
);

describe("beer catalog data", () => {
  it("ships a meaningful number of beers and barcodes", () => {
    expect(catalog.entries.length).toBeGreaterThan(50);
    expect(allCodes.length).toBeGreaterThan(200);
  });

  it("gives every beer a name, brand and style", () => {
    for (const entry of catalog.entries) {
      expect(entry.name.trim()).not.toBe("");
      expect(entry.brand.trim()).not.toBe("");
      expect(entry.style.trim()).not.toBe("");
    }
  });

  it("carries only normalised barcodes the scanner can produce", () => {
    for (const { code } of allCodes) {
      expect(normalizeBarcode(code.barcode)).toBe(code.barcode);
    }
  });

  it("carries only barcodes whose check digit adds up", () => {
    // Open Food Facts is crowd-sourced and holds hand-typed codes that are a
    // digit off. One of those in the catalog would shadow a real beer forever.
    for (const { entry, code } of allCodes) {
      expect(hasValidCheckDigit(code.barcode), `${entry.name} ${code.barcode}`).toBe(true);
    }
  });

  it("never lets two beers claim the same barcode", () => {
    const owners = new Map<string, string>();
    for (const { entry, code } of allCodes) {
      const existing = owners.get(code.barcode);
      expect(existing ?? entry.name).toBe(entry.name);
      owners.set(code.barcode, entry.name);
    }
  });

  it("holds a usable ABV and volume for every barcode", () => {
    for (const { code } of allCodes) {
      expect(hasAlcoholData(code)).toBe(true);
    }
  });

  it("keeps ABV in beer territory, stated to one decimal", () => {
    for (const { entry, code } of allCodes) {
      expect(code.abv, entry.name).toBeGreaterThan(0);
      expect(code.abv, entry.name).toBeLessThanOrEqual(15);
      // Open Food Facts derives alcohol from grams and returns things like
      // 7.49544919156227. A can states one decimal place; so do we.
      expect(code.abv, entry.name).toBe(Math.round(code.abv! * 10) / 10);
    }
  });

  it("stores one serving, not a multipack", () => {
    // A 6-pack's 1980 ml would otherwise be logged as a single drink and score
    // six times what the drinker actually had.
    for (const { entry, code } of allCodes) {
      expect(code.volumeMl, entry.name).toBeGreaterThanOrEqual(100);
      expect(code.volumeMl, entry.name).toBeLessThanOrEqual(1000);
    }
  });

  it("yields a believable standard-drink count per serving", () => {
    // The ceiling separates the largest honest single bottle in the catalog — a
    // 750 ml Belgian strong ale at 9.5%, which really is 4 standard drinks —
    // from a multipack that slipped past the volume guard: a six-pack of 355 ml
    // lager scores just under 6.
    for (const { entry, code } of allCodes) {
      const drinks = standardDrinks(code);
      expect(drinks, entry.name).not.toBeNull();
      expect(drinks!, entry.name).toBeGreaterThan(0.2);
      expect(drinks!, entry.name).toBeLessThan(5);
    }
  });

  it("only points at Open Food Facts images", () => {
    for (const { code } of allCodes) {
      if (code.imageUrl === null) continue;
      expect(code.imageUrl).toMatch(/^https:\/\/images\.openfoodfacts\.org\//);
    }
  });

  it("leaves most manufacturer prefixes pointing at a single brand", () => {
    // guessBrand() only fires when every catalog beer under a prefix agrees on
    // a brand, so this is what decides whether the hint can appear at all.
    //
    // Collisions are expected, not broken: brewing groups run many brands off
    // one GS1 prefix — AB InBev covers Budweiser, Michelob, Bud Light and
    // Stella Artois; Heineken covers Moretti, Cruzcampo, Red Stripe and Tiger.
    // On those the hint correctly stays silent rather than picking a sibling at
    // random. What this guards against is the hint becoming useless, so it
    // asserts the unambiguous prefixes stay the clear majority.
    const brandsByPrefix = new Map<string, Set<string>>();
    for (const { entry, code } of allCodes) {
      const prefix = companyPrefixes(code.barcode)[0];
      if (!prefix) continue;
      if (!brandsByPrefix.has(prefix)) brandsByPrefix.set(prefix, new Set());
      brandsByPrefix.get(prefix)!.add(entry.brand);
    }

    expect(brandsByPrefix.size).toBeGreaterThan(100);
    const shared = [...brandsByPrefix.values()].filter((brands) => brands.size > 1);
    expect(shared.length / brandsByPrefix.size).toBeLessThan(0.25);
  });
});

describe("companyPrefixes", () => {
  it("returns 9, 8 and 7 digit heads of an EAN-13, longest first", () => {
    expect(companyPrefixes("5000213002346")).toEqual(["500021300", "50002130", "5000213"]);
  });

  it("pads a UPC-A to 13 digits first, so both scanner readings agree", () => {
    expect(companyPrefixes("072890000019")).toEqual(companyPrefixes("0072890000019"));
  });

  it("gives nothing for EAN-8, whose leading digits name no manufacturer", () => {
    expect(companyPrefixes("75041670")).toEqual([]);
  });

  it("gives nothing for input that isn't a barcode", () => {
    expect(companyPrefixes("not-a-barcode")).toEqual([]);
    expect(companyPrefixes("")).toEqual([]);
  });
});
