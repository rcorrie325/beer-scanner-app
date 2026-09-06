import { describe, expect, it, vi } from "vitest";
import {
  deriveStyle,
  extractAbv,
  lookupBarcode,
  mapProduct,
  parseVolumeMl,
  type FetchLike,
} from "@/lib/openfoodfacts";
import { normalizeBarcode } from "@/lib/barcode";

/** Builds a fetch stand-in that returns a fixed JSON body. */
function jsonFetch(status: number, body: unknown): FetchLike {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

const BEER_PRODUCT = {
  code: "5000213002346",
  product_name: "Guinness Draught",
  brands: "Guinness, Diageo",
  categories: "Beverages, Alcoholic beverages, Beers, Stouts",
  categories_tags: ["en:beverages", "en:alcoholic-beverages", "en:beers", "en:stouts"],
  quantity: "440 ml",
  product_quantity: 440,
  product_quantity_unit: "ml",
  image_front_url: "https://images.openfoodfacts.org/images/products/front.jpg",
  nutriments: { alcohol_value: 4.2, alcohol_unit: "% vol" },
};

describe("lookupBarcode — hit", () => {
  it("maps an Open Food Facts beer onto Beverage fields", async () => {
    const fetchImpl = jsonFetch(200, { status: 1, product: BEER_PRODUCT });

    const result = await lookupBarcode("5000213002346", { fetchImpl });

    expect(result.status).toBe("hit");
    if (result.status !== "hit") return;

    expect(result.product).toMatchObject({
      barcode: "5000213002346",
      name: "Guinness Draught",
      brand: "Guinness",
      style: "Stout",
      abv: 4.2,
      volumeMl: 440,
      looksAlcoholic: true,
    });
    expect(result.product.imageUrl).toContain("openfoodfacts.org");
  });

  it("requests the barcode it was given", async () => {
    const fetchImpl = jsonFetch(200, { status: 1, product: BEER_PRODUCT });
    await lookupBarcode("5000213002346", { fetchImpl });

    const url = (fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(url).toContain("/5000213002346.json");
  });

  it("flags a product that clearly isn't a drink", async () => {
    const fetchImpl = jsonFetch(200, {
      status: 1,
      product: {
        product_name: "Salt & Vinegar Crisps",
        brands: "Walkers",
        categories: "Snacks, Salty snacks, Crisps",
        categories_tags: ["en:snacks", "en:crisps"],
        quantity: "150 g",
      },
    });

    const result = await lookupBarcode("5000328888888", { fetchImpl });

    expect(result.status).toBe("hit");
    if (result.status !== "hit") return;
    expect(result.product.looksAlcoholic).toBe(false);
    expect(result.product.abv).toBeNull();
    // "150 g" is a weight, not a volume — we must not invent a serving size.
    expect(result.product.volumeMl).toBeNull();
  });

  it("treats a named alcohol-free beer as non-alcoholic", async () => {
    const fetchImpl = jsonFetch(200, {
      status: 1,
      product: {
        product_name: "Nanny State",
        brands: "BrewDog",
        categories: "Beers, Non-alcoholic beers",
        categories_tags: ["en:beers", "en:non-alcoholic-beers"],
        quantity: "330 ml",
      },
    });

    const result = await lookupBarcode("5060192460001", { fetchImpl });
    expect(result.status).toBe("hit");
    if (result.status !== "hit") return;
    expect(result.product.looksAlcoholic).toBe(false);
    expect(result.product.style).toBe("Non-alcoholic");
  });
});

describe("lookupBarcode — miss", () => {
  it("treats status 0 as a miss", async () => {
    const fetchImpl = jsonFetch(200, { status: 0, status_verbose: "product not found" });
    await expect(lookupBarcode("0000000000000", { fetchImpl })).resolves.toEqual({
      status: "miss",
    });
  });

  it("treats HTTP 404 as a miss, not an error", async () => {
    const fetchImpl = jsonFetch(404, {});
    await expect(lookupBarcode("0000000000000", { fetchImpl })).resolves.toEqual({
      status: "miss",
    });
  });

  it("treats a product with no usable name as a miss", async () => {
    const fetchImpl = jsonFetch(200, {
      status: 1,
      product: { code: "123", brands: "Unknown", product_name: "" },
    });
    await expect(lookupBarcode("5000000000000", { fetchImpl })).resolves.toEqual({
      status: "miss",
    });
  });
});

describe("lookupBarcode — network failure", () => {
  it("reports an error when the request throws", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND world.openfoodfacts.org");
    });

    const result = await lookupBarcode("5000213002346", { fetchImpl });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.reason).toMatch(/unreachable/i);
  });

  it("reports an error on a timeout", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    });

    const result = await lookupBarcode("5000213002346", { fetchImpl });
    expect(result).toEqual({ status: "error", reason: "Open Food Facts timed out" });
  });

  it("reports an error on a 5xx", async () => {
    const result = await lookupBarcode("5000213002346", { fetchImpl: jsonFetch(503, {}) });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.reason).toContain("503");
  });

  it("reports an error when the body isn't JSON", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));

    const result = await lookupBarcode("5000213002346", { fetchImpl });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.reason).toMatch(/malformed/i);
  });
});

describe("field mapping", () => {
  it("parses the volume formats Open Food Facts actually uses", () => {
    expect(parseVolumeMl("330 ml")).toBe(330);
    expect(parseVolumeMl("500ml")).toBe(500);
    expect(parseVolumeMl("33 cl")).toBe(330);
    expect(parseVolumeMl("0,33 l")).toBe(330);
    expect(parseVolumeMl("1 L")).toBe(1000);
    expect(parseVolumeMl("12 fl oz")).toBe(355);
    // Multipacks give the per-bottle volume, which is what you drink.
    expect(parseVolumeMl("6 x 330 ml")).toBe(330);
  });

  it("returns null rather than guessing", () => {
    expect(parseVolumeMl(null)).toBeNull();
    expect(parseVolumeMl("")).toBeNull();
    expect(parseVolumeMl("150 g")).toBeNull();
    expect(parseVolumeMl("family pack")).toBeNull();
    expect(parseVolumeMl("2 ml")).toBeNull(); // implausible as a serving
  });

  it("reads ABV from whichever nutriment field is populated", () => {
    expect(extractAbv({ alcohol_value: 5.4 })).toBe(5.4);
    expect(extractAbv({ alcohol_100g: 4.8 })).toBe(4.8);
    expect(extractAbv({ alcohol: "6.2" })).toBe(6.2);
    expect(extractAbv({ alcohol_value: 0 })).toBeNull();
    expect(extractAbv({})).toBeNull();
    expect(extractAbv(null)).toBeNull();
  });

  it("derives a style from categories, then falls back to the name", () => {
    expect(deriveStyle(["en:india-pale-ale"], null, null)).toBe("IPA");
    expect(deriveStyle([], "Beers, Lagers", null)).toBe("Lager");
    expect(deriveStyle([], null, "Hazy Session IPA")).toBe("IPA");
    expect(deriveStyle([], null, "Something Unlabelled")).toBeNull();
  });

  it("returns null for an unusable product payload", () => {
    expect(mapProduct("123", null)).toBeNull();
    expect(mapProduct("123", { brands: "Nameless" })).toBeNull();
  });
});

describe("barcode normalisation", () => {
  it("widens UPC-A to EAN-13 so one bottle is one row", () => {
    expect(normalizeBarcode("012345678905")).toBe("0012345678905");
  });

  it("accepts EAN-13 and EAN-8 unchanged", () => {
    expect(normalizeBarcode("5000213002346")).toBe("5000213002346");
    expect(normalizeBarcode("96385074")).toBe("96385074");
  });

  it("rejects anything else", () => {
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("abcdefghijklm")).toBeNull();
    expect(normalizeBarcode("")).toBeNull();
  });
});
