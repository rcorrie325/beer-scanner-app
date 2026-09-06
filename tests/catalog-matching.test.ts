import { describe, expect, it } from "vitest";
// Build tooling, not app code: plain JS, inferred by `allowJs`.
import { matchEntry, servingVolumeMl, toCatalogCode } from "../scripts/catalog-matching.mjs";

/**
 * The rules that attach a real barcode to a beer.
 *
 * These run once, at build time, and their output is then trusted forever: a
 * seeded barcode never gets re-checked against Open Food Facts. A rule that is
 * too loose puts the wrong beer — and the wrong ABV — behind somebody's scan,
 * and nothing downstream would ever notice. The cases below are the ones that
 * actually bit during the first builds.
 */

const BUSCH_LIGHT = {
  brand: "Busch",
  name: "Busch Light",
  keywords: ["busch", "light"],
  style: "Lager",
  abv: 4.1,
  volumeMl: 355,
};

const CORONA_EXTRA = {
  brand: "Corona",
  name: "Corona Extra",
  keywords: ["extra"],
  exclude: ["light", "familiar"],
  style: "Lager",
  abv: 4.6,
  volumeMl: 355,
};

const CORONA_LIGHT = {
  brand: "Corona",
  name: "Corona Light",
  keywords: ["light"],
  style: "Lager",
  abv: 4.0,
  volumeMl: 355,
};

/** An OFF product with sane defaults, overridable per case. */
function product(overrides: Record<string, unknown> = {}) {
  return {
    code: "0018200202407",
    product_name: "Busch Light",
    categories_tags: [],
    quantity: "355 ml",
    nutriments: {},
    ...overrides,
  };
}

describe("matchEntry", () => {
  it("matches a product whose name carries every keyword", () => {
    expect(matchEntry(product(), [BUSCH_LIGHT])).toBe(BUSCH_LIGHT);
  });

  it("ignores a same-brand product missing a keyword", () => {
    expect(matchEntry(product({ product_name: "Busch Beer" }), [BUSCH_LIGHT])).toBeNull();
  });

  it("honours an entry's own exclusions", () => {
    const hit = matchEntry(product({ product_name: "Corona Extra Light" }), [CORONA_EXTRA]);
    expect(hit).toBeNull();
  });

  it("picks the more specific of two entries that both fit", () => {
    // "Corona Extra" satisfies Corona Extra's keywords only; "Corona Light"
    // satisfies Corona Light's. The pair must not cross-claim.
    expect(matchEntry(product({ product_name: "Corona Extra" }), [CORONA_EXTRA, CORONA_LIGHT])).toBe(
      CORONA_EXTRA,
    );
    expect(matchEntry(product({ product_name: "Corona Light" }), [CORONA_EXTRA, CORONA_LIGHT])).toBe(
      CORONA_LIGHT,
    );
  });

  it("refuses alcohol-free variants of a beer it otherwise knows", () => {
    for (const name of [
      "Busch Light 0.0",
      "Busch Light Alcohol Free",
      "Busch Light sans alcool",
      "Busch Light Zero",
    ]) {
      expect(matchEntry(product({ product_name: name }), [BUSCH_LIGHT]), name).toBeNull();
    }
  });

  it("matches whole words, so a keyword can't hide inside a longer one", () => {
    const sol = { brand: "Sol", name: "Sol", keywords: ["sol"], style: "Lager", abv: 4.5, volumeMl: 330 };
    expect(matchEntry(product({ product_name: "Sol Cerveza" }), [sol])).toBe(sol);
    expect(matchEntry(product({ product_name: "Aceite de girasol" }), [sol])).toBeNull();
  });

  it("matches a numeric keyword only as its own word", () => {
    const rochefort10 = {
      brand: "Rochefort",
      name: "Rochefort 10",
      keywords: ["10"],
      style: "Belgian",
      abv: 11.3,
      volumeMl: 330,
    };
    expect(matchEntry(product({ product_name: "Trappistes Rochefort 10" }), [rochefort10])).toBe(
      rochefort10,
    );
    expect(matchEntry(product({ product_name: "Trappistes Rochefort 8" }), [rochefort10])).toBeNull();
    expect(matchEntry(product({ product_name: "Rochefort 8 105 cl" }), [rochefort10])).toBeNull();
  });

  it("ignores a nameless product", () => {
    expect(matchEntry(product({ product_name: "" }), [BUSCH_LIGHT])).toBeNull();
  });
});

describe("toCatalogCode", () => {
  it("keeps a plain uncategorised US product", () => {
    // Most American beers on OFF have no categories at all. Requiring one threw
    // away nearly every US brand on the first build.
    const match = toCatalogCode(product(), [BUSCH_LIGHT]);
    expect(match?.entry).toBe(BUSCH_LIGHT);
    expect(match?.code).toMatchObject({ barcode: "0018200202407", abv: 4.1, volumeMl: 355 });
  });

  it("drops a categorised non-drink sharing the brand", () => {
    // Busch the brewery and Busch the German bakery share a brand tag.
    const pastry = product({
      product_name: "Busch Light Feines Schaumgebäck",
      categories_tags: ["en:pastries", "en:meringues"],
    });
    expect(toCatalogCode(pastry, [BUSCH_LIGHT])).toBeNull();
  });

  it("prefers OFF's own ABV, because strength varies by market", () => {
    const match = toCatalogCode(product({ nutriments: { alcohol_value: 4.6 } }), [BUSCH_LIGHT]);
    expect(match?.code.abv).toBe(4.6);
  });

  it("rejects a product whose ABV is nowhere near the beer's", () => {
    // OFF holds a "Light beer" at 11.2%. Whatever that is, it isn't this.
    expect(toCatalogCode(product({ nutriments: { alcohol_value: 11.2 } }), [BUSCH_LIGHT])).toBeNull();
  });

  it("rejects a code whose check digit doesn't add up", () => {
    // "01818828" is real OFF data filed under Busch, and isn't a valid GTIN.
    expect(toCatalogCode(product({ code: "01818828" }), [BUSCH_LIGHT])).toBeNull();
    expect(toCatalogCode(product({ code: "0018200202400" }), [BUSCH_LIGHT])).toBeNull();
    expect(toCatalogCode(product({ code: "not-digits" }), [BUSCH_LIGHT])).toBeNull();
  });

  it("keeps a valid EAN-8, which is what Mexican brewers actually print", () => {
    const tecate = { brand: "Tecate", name: "Tecate", keywords: ["tecate"], style: "Lager", abv: 4.5, volumeMl: 355 };
    const match = toCatalogCode(
      product({ code: "75005191", product_name: "Tecate", quantity: "355 ml" }),
      [tecate],
    );
    expect(match?.code.barcode).toBe("75005191");
  });

  it("normalises UPC-A to EAN-13, so both scanner readings hit one row", () => {
    const match = toCatalogCode(product({ code: "018200202407" }), [BUSCH_LIGHT]);
    expect(match?.code.barcode).toBe("0018200202407");
  });
});

describe("servingVolumeMl", () => {
  it("reads the per-bottle size out of a multipack", () => {
    expect(servingVolumeMl({ quantity: "6 x 33 cl", product_quantity: 1980 }, 355)).toBe(330);
  });

  it("falls back to the beer's own serving when only a pack total is known", () => {
    // A 3000 ml row would score nine drinks for one glass.
    expect(
      servingVolumeMl({ quantity: null, product_quantity: 3000, product_quantity_unit: "ml" }, 355),
    ).toBe(355);
  });

  it("falls back when nothing is known at all", () => {
    expect(servingVolumeMl({}, 500)).toBe(500);
  });

  it("keeps an ordinary single serving", () => {
    expect(servingVolumeMl({ quantity: "440 ml" }, 355)).toBe(440);
    expect(servingVolumeMl({ quantity: "12 fl oz" }, 500)).toBe(355);
  });
});
