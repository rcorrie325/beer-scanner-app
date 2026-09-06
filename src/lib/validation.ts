import { z } from "zod";
import { normalizeBarcode } from "@/lib/barcode";

/**
 * Every input that reaches the server goes through one of these. Form fields
 * arrive as strings (and as "" when empty), so the optional numeric fields are
 * pre-processed into undefined rather than being coerced to 0 — an empty ABV
 * box must stay unknown, never become 0%.
 */

/**
 * `FormData.get` returns null for a field that isn't in the form at all and ""
 * for one the user left blank. Both mean "unknown", and both must become
 * undefined so the optional schemas stay optional instead of failing or, worse,
 * coercing to 0.
 */
const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(40, "Keep it under 40 characters");

export const barcodeSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeBarcode(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Not a valid EAN-13, EAN-8 or UPC-A barcode",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const quantitySchema = z.coerce
  .number()
  .int("Whole drinks only")
  .min(1, "At least one")
  .max(20, "That's a round, not a drink");

export const idSchema = z.string().trim().min(1).max(64);

export const abvSchema = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .min(0.1, "ABV looks too low — leave it blank if you don't know")
    .max(100, "ABV can't exceed 100%")
    .optional(),
);

export const volumeMlSchema = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .int("Whole millilitres")
    .min(10, "That's not a serving")
    .max(20000, "That's not a serving")
    .optional(),
);

export const beverageDetailsSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  brand: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  style: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  abv: abvSchema,
  volumeMl: volumeMlSchema,
});

export const createBeverageSchema = beverageDetailsSchema.extend({
  barcode: z.preprocess(emptyToUndefined, barcodeSchema.optional()),
  imageUrl: z.preprocess(
    emptyToUndefined,
    z.string().trim().url().max(500).optional(),
  ),
  source: z.enum(["scan", "manual"]).default("manual"),
});

export const logDrinkSchema = z.object({
  beverageId: idSchema,
  quantity: quantitySchema.default(1),
});

export const periodSchema = z.enum(["today", "week", "all"]).catch("today");

export const searchQuerySchema = z.string().trim().max(60).default("");

export type CreateBeverageInput = z.infer<typeof createBeverageSchema>;
export type LogDrinkInput = z.infer<typeof logDrinkSchema>;

/** Shape returned by every Server Action, so forms can render errors uniformly. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Flattens a zod error into the ActionResult shape. */
export function failFromZod(error: z.ZodError): ActionResult<never> {
  const flat = error.flatten();
  const firstFieldError = Object.values(flat.fieldErrors).flat().filter(Boolean)[0];
  return {
    ok: false,
    error: flat.formErrors[0] ?? firstFieldError ?? "That input didn't look right",
    fieldErrors: flat.fieldErrors as Record<string, string[]>,
  };
}
