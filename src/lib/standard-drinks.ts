/**
 * Standard-drink maths.
 *
 * A "standard drink" here is the US definition: 14 grams of pure ethanol.
 * Grams of alcohol in a serving = volume(mL) x ABV/100 x 0.789 g/mL.
 *
 * Hard rule: if either ABV or volume is unknown we return null and the caller
 * shows the raw count instead. We never substitute a default ABV — a guessed
 * number silently poisons the whole leaderboard.
 */

/** Density of ethanol at 20°C, g/mL. */
export const ETHANOL_DENSITY_G_PER_ML = 0.789;

/** Grams of pure alcohol in one US standard drink. */
export const STANDARD_DRINK_GRAMS = 14;

export type AlcoholFacts = {
  abv: number | null | undefined;
  volumeMl: number | null | undefined;
};

/** True when we have enough information to do the maths at all. */
export function hasAlcoholData(b: AlcoholFacts): boolean {
  return (
    typeof b.abv === "number" &&
    Number.isFinite(b.abv) &&
    b.abv > 0 &&
    typeof b.volumeMl === "number" &&
    Number.isFinite(b.volumeMl) &&
    b.volumeMl > 0
  );
}

/** Grams of ethanol in `quantity` servings, or null when data is missing. */
export function gramsOfAlcohol(b: AlcoholFacts, quantity = 1): number | null {
  if (!hasAlcoholData(b)) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return b.volumeMl! * (b.abv! / 100) * ETHANOL_DENSITY_G_PER_ML * quantity;
}

/** Standard drinks in `quantity` servings, or null when data is missing. */
export function standardDrinks(b: AlcoholFacts, quantity = 1): number | null {
  const grams = gramsOfAlcohol(b, quantity);
  return grams === null ? null : grams / STANDARD_DRINK_GRAMS;
}

export type StandardDrinkTotals = {
  /** Sum of `quantity` across every log. */
  drinkCount: number;
  /** Standard drinks from logs where both ABV and volume are known. */
  standardDrinks: number;
  /** Servings that contributed to `standardDrinks`. */
  countedServings: number;
  /** Servings we couldn't score because ABV and/or volume was missing. */
  unknownServings: number;
};

export type LogLike = {
  quantity: number;
  beverage: AlcoholFacts;
};

/**
 * Totals over a set of logs. Servings with missing data are counted in
 * `drinkCount` and reported separately in `unknownServings` so the UI can say
 * "5.2 standard drinks (2 drinks unknown)" rather than quietly under-reporting.
 */
export function totalStandardDrinks(logs: LogLike[]): StandardDrinkTotals {
  let drinkCount = 0;
  let total = 0;
  let countedServings = 0;
  let unknownServings = 0;

  for (const log of logs) {
    const quantity = Number.isFinite(log.quantity) ? log.quantity : 0;
    drinkCount += quantity;

    const sd = standardDrinks(log.beverage, quantity);
    if (sd === null) {
      unknownServings += quantity;
    } else {
      total += sd;
      countedServings += quantity;
    }
  }

  return { drinkCount, standardDrinks: total, countedServings, unknownServings };
}

/** One decimal place, e.g. "3.4". */
export function formatStandardDrinks(value: number): string {
  return value.toFixed(1);
}
