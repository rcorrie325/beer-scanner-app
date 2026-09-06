/**
 * Barcode formats we accept: EAN-13, EAN-8 and UPC-A.
 *
 * UPC-A is a 12-digit code that is really an EAN-13 with a leading zero, and
 * different scanners report it either way. We always normalise to 13 digits so
 * the same physical bottle can't end up as two Beverage rows.
 */

export const SUPPORTED_BARCODE_LENGTHS = [8, 12, 13];

export function normalizeBarcode(raw: string): string | null {
  const digits = raw.trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12) return `0${digits}`; // UPC-A -> EAN-13
  if (digits.length === 8 || digits.length === 13) return digits;
  return null;
}

export function isSupportedBarcode(raw: string): boolean {
  return normalizeBarcode(raw) !== null;
}

/**
 * Leading slices of an EAN-13 to try as a GS1 company prefix, longest first.
 *
 * A GTIN starts with a company prefix that GS1 issues to one manufacturer, so
 * two barcodes sharing a long enough head almost always come from the same
 * brewery. That's the whole trick behind the "looks like a Heineken" hint on a
 * barcode nothing recognises: the digits can't tell us *which* beer it is, but
 * they narrow down who made it.
 *
 * The prefix is 7 to 11 digits and its real length isn't encoded in the barcode
 * — you'd need GS1's registry — so callers try these in order and take the
 * first that matches something. Nine digits is where we start: short enough
 * that a brewery's whole range still shares it, long enough that unrelated
 * companies don't collide.
 *
 * EAN-8 codes get nothing back. They're issued from a separate, much smaller
 * pool where a leading slice says nothing about the manufacturer.
 */
export const COMPANY_PREFIX_LENGTHS = [9, 8, 7];

export function companyPrefixes(barcode: string): string[] {
  const normalized = normalizeBarcode(barcode);
  if (!normalized || normalized.length !== 13) return [];
  return COMPANY_PREFIX_LENGTHS.map((length) => normalized.slice(0, length));
}
