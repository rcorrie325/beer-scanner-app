import { describe, expect, it } from "vitest";
import {
  gramsOfAlcohol,
  hasAlcoholData,
  standardDrinks,
  totalStandardDrinks,
  STANDARD_DRINK_GRAMS,
} from "@/lib/standard-drinks";

const PINT_OF_IPA = { abv: 5.6, volumeMl: 568 };
const CAN_OF_LAGER = { abv: 4.0, volumeMl: 330 };
const MYSTERY_HOMEBREW = { abv: null, volumeMl: null };

describe("gramsOfAlcohol", () => {
  it("multiplies volume by ABV by ethanol density", () => {
    // 330 * 0.04 * 0.789 = 10.4148 g
    expect(gramsOfAlcohol(CAN_OF_LAGER)).toBeCloseTo(10.4148, 4);
  });

  it("scales with quantity", () => {
    const one = gramsOfAlcohol(CAN_OF_LAGER, 1)!;
    expect(gramsOfAlcohol(CAN_OF_LAGER, 3)).toBeCloseTo(one * 3, 6);
  });
});

describe("standardDrinks", () => {
  it("divides grams of alcohol by the 14 g standard", () => {
    const grams = gramsOfAlcohol(PINT_OF_IPA)!;
    expect(standardDrinks(PINT_OF_IPA)).toBeCloseTo(grams / STANDARD_DRINK_GRAMS, 6);
    // A pint of 5.6% is a little over one and a half standard drinks.
    expect(standardDrinks(PINT_OF_IPA)).toBeCloseTo(1.793, 3);
  });

  it("says a US 12oz 5% beer is almost exactly one standard drink", () => {
    // The definition is built around this serving, so it's a good sanity check.
    expect(standardDrinks({ abv: 5, volumeMl: 355 })).toBeCloseTo(1.0, 1);
  });
});

describe("missing data is never guessed", () => {
  it("returns null when both ABV and volume are unknown", () => {
    expect(standardDrinks(MYSTERY_HOMEBREW)).toBeNull();
    expect(gramsOfAlcohol(MYSTERY_HOMEBREW)).toBeNull();
    expect(hasAlcoholData(MYSTERY_HOMEBREW)).toBe(false);
  });

  it("returns null when only the ABV is known", () => {
    expect(standardDrinks({ abv: 5.2, volumeMl: null })).toBeNull();
  });

  it("returns null when only the volume is known", () => {
    expect(standardDrinks({ abv: null, volumeMl: 330 })).toBeNull();
  });

  it("returns null for undefined, zero and non-finite values", () => {
    expect(standardDrinks({ abv: undefined, volumeMl: undefined })).toBeNull();
    expect(standardDrinks({ abv: 0, volumeMl: 330 })).toBeNull();
    expect(standardDrinks({ abv: 5, volumeMl: 0 })).toBeNull();
    expect(standardDrinks({ abv: Number.NaN, volumeMl: 330 })).toBeNull();
  });

  it("returns null for a non-positive quantity", () => {
    expect(standardDrinks(CAN_OF_LAGER, 0)).toBeNull();
    expect(standardDrinks(CAN_OF_LAGER, -1)).toBeNull();
  });
});

describe("totalStandardDrinks", () => {
  it("adds up a mixed set and reports what it couldn't score", () => {
    const totals = totalStandardDrinks([
      { quantity: 2, beverage: CAN_OF_LAGER },
      { quantity: 1, beverage: PINT_OF_IPA },
      { quantity: 3, beverage: MYSTERY_HOMEBREW },
    ]);

    expect(totals.drinkCount).toBe(6);
    expect(totals.countedServings).toBe(3);
    expect(totals.unknownServings).toBe(3);

    const expected = standardDrinks(CAN_OF_LAGER, 2)! + standardDrinks(PINT_OF_IPA, 1)!;
    expect(totals.standardDrinks).toBeCloseTo(expected, 6);
  });

  it("counts an unknown drink in the raw total but not the standard total", () => {
    const totals = totalStandardDrinks([{ quantity: 1, beverage: MYSTERY_HOMEBREW }]);
    expect(totals.drinkCount).toBe(1);
    expect(totals.standardDrinks).toBe(0);
    expect(totals.unknownServings).toBe(1);
    expect(totals.countedServings).toBe(0);
  });

  it("handles an empty set", () => {
    expect(totalStandardDrinks([])).toEqual({
      drinkCount: 0,
      standardDrinks: 0,
      countedServings: 0,
      unknownServings: 0,
    });
  });
});
