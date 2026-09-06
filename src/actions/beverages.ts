"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { lookupBarcode } from "@/lib/openfoodfacts";
import { companyPrefixes } from "@/lib/barcode";
import {
  barcodeSchema,
  createBeverageSchema,
  fail,
  failFromZod,
  idSchema,
  type ActionResult,
} from "@/lib/validation";

export type ResolveBarcodeResult =
  | { status: "known"; beverageId: string; cached: boolean }
  /** `brandHint` is a guess from the barcode's GS1 prefix — see `guessBrand`. */
  | { status: "unknown"; barcode: string; brandHint: string | null }
  | { status: "error"; barcode: string; reason: string }
  | { status: "invalid"; reason: string };

/**
 * Best guess at who made an unrecognised bottle, from the manufacturer prefix
 * its barcode shares with beers we already know.
 *
 * This is the last thing standing between a scan and an empty form. It cannot
 * name the beer — only the brewery — so the result is offered as a pre-filled,
 * editable brand field and never written anywhere on its own. A wrong guess
 * costs one backspace; a right one saves typing at a party, which is when
 * every unknown barcode gets scanned.
 *
 * Longest prefix wins, and a prefix only counts if the beers under it agree on
 * a brand. Prefix pools are occasionally shared between companies, and a split
 * vote is exactly what that looks like.
 */
async function guessBrand(barcode: string): Promise<string | null> {
  for (const prefix of companyPrefixes(barcode)) {
    const neighbours = await prisma.beverage.findMany({
      where: { barcode: { startsWith: prefix }, brand: { not: null } },
      select: { brand: true },
      take: 50,
    });
    if (neighbours.length === 0) continue;

    const brands = new Set(neighbours.map((n) => n.brand!));
    if (brands.size === 1) return neighbours[0].brand;
  }
  return null;
}

/**
 * Turns a scanned barcode into a Beverage the user can confirm.
 *
 * Order of operations matters: we look in our own table first, so a barcode
 * anybody has ever scanned resolves without touching the network. That table is
 * pre-loaded with a catalog of common beers (`npm run db:seed`), which is why
 * most of what turns up at a party matches instantly and never depends on the
 * wifi. Beverages are global — if someone else already scanned this can, we
 * reuse their row instead of creating a second one.
 *
 * When Open Food Facts doesn't know the barcode we deliberately do *not* write
 * a placeholder row; the user is sent to the manual form pre-filled with the
 * barcode and a guessed brand, and saving that form is what creates the cached
 * row.
 */
export async function resolveBarcodeAction(rawBarcode: string): Promise<ResolveBarcodeResult> {
  const parsed = barcodeSchema.safeParse(rawBarcode);
  if (!parsed.success) {
    return { status: "invalid", reason: "That doesn't look like a beer barcode" };
  }
  const barcode = parsed.data;

  const cached = await prisma.beverage.findUnique({
    where: { barcode },
    select: { id: true },
  });
  if (cached) return { status: "known", beverageId: cached.id, cached: true };

  const result = await lookupBarcode(barcode);

  if (result.status === "error") {
    return { status: "error", barcode, reason: result.reason };
  }
  if (result.status === "miss") {
    return { status: "unknown", barcode, brandHint: await guessBrand(barcode) };
  }

  const p = result.product;
  try {
    const created = await prisma.beverage.create({
      data: {
        barcode,
        name: p.name,
        brand: p.brand,
        style: p.style,
        abv: p.abv,
        volumeMl: p.volumeMl,
        imageUrl: p.imageUrl,
        source: "scan",
      },
      select: { id: true },
    });
    return { status: "known", beverageId: created.id, cached: false };
  } catch (error) {
    // Two phones scanning the same new bottle at once: whoever lost the race
    // just uses the row the winner created.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.beverage.findUnique({
        where: { barcode },
        select: { id: true },
      });
      if (existing) return { status: "known", beverageId: existing.id, cached: true };
    }
    return { status: "error", barcode, reason: "Couldn't save that beverage" };
  }
}

/**
 * Creates a beverage from the manual form (or from an edited scan result) and
 * sends the user to the confirm screen to set a quantity and save.
 */
export async function createBeverageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const parsed = createBeverageSchema.safeParse({
    name: formData.get("name"),
    brand: formData.get("brand"),
    style: formData.get("style"),
    abv: formData.get("abv"),
    volumeMl: formData.get("volumeMl"),
    barcode: formData.get("barcode"),
    imageUrl: formData.get("imageUrl"),
    // Anything typed into this form is user-authored, barcode or not.
    source: "manual",
  });
  if (!parsed.success) return failFromZod(parsed.error);

  const { name, brand, style, abv, volumeMl, barcode, imageUrl } = parsed.data;

  let beverageId: string;
  try {
    const created = await prisma.beverage.create({
      data: {
        name,
        brand: brand ?? null,
        style: style ?? null,
        abv: abv ?? null,
        volumeMl: volumeMl ?? null,
        barcode: barcode ?? null,
        imageUrl: imageUrl ?? null,
        source: "manual",
      },
      select: { id: true },
    });
    beverageId = created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && barcode) {
      const existing = await prisma.beverage.findUnique({
        where: { barcode },
        select: { id: true },
      });
      if (!existing) return fail("Couldn't save that beverage");
      beverageId = existing.id;
    } else {
      return fail("Couldn't save that beverage");
    }
  }

  revalidatePath("/", "layout");
  redirect(`/confirm/${beverageId}`);
}

/**
 * Teaches an existing beverage the barcode that was just scanned.
 *
 * This is how the catalog's gaps actually get filled. Open Food Facts has no
 * usable code for a good few well-known beers — Samuel Adams, Fat Tire, Shiner
 * Bock — and no product database reliably does, because US beer carries no
 * nutrition label and so never enters one. The can in someone's hand is the
 * better source, and this is what keeps what it says.
 *
 * A row holds one barcode, so which of the two things happens depends on
 * whether the target already has one:
 *
 *   - no barcode yet (a seeded placeholder): it takes this code directly.
 *   - already has a different one: a sibling row is created carrying the same
 *     details. That's the shape the catalog already uses for a beer sold in
 *     several pack sizes — six Natural Light rows, one per code.
 *
 * Either way the row ends up `source: "manual"`, which is what stops the next
 * `npm run db:seed` from refreshing the answer away or sweeping the row.
 *
 * What's learned is shared. `Beverage` carries no `userId` — only `DrinkLog`
 * does — so one person teaching a barcode teaches it for everyone on the
 * server, immediately and without them doing anything. At a party that matters:
 * whoever opens the first case is the only one who has to identify it.
 */
export async function attachBarcodeAction(
  rawBeverageId: string,
  rawBarcode: string,
): Promise<ActionResult<{ beverageId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const id = idSchema.safeParse(rawBeverageId);
  if (!id.success) return fail("That beverage doesn't exist");

  const parsedBarcode = barcodeSchema.safeParse(rawBarcode);
  if (!parsedBarcode.success) return fail("That doesn't look like a beer barcode");
  const barcode = parsedBarcode.data;

  const target = await prisma.beverage.findUnique({
    where: { id: id.data },
    select: { id: true, barcode: true, name: true, brand: true, style: true, abv: true, volumeMl: true, imageUrl: true },
  });
  if (!target) return fail("That beverage doesn't exist");

  // Somebody else may have attached this code in the meantime — on a shared
  // phone at a party, quite possibly seconds ago. Their row wins; this just
  // points at it rather than failing on the unique constraint.
  const claimed = await prisma.beverage.findUnique({ where: { barcode }, select: { id: true } });
  if (claimed) {
    revalidatePath("/", "layout");
    return { ok: true, data: { beverageId: claimed.id } };
  }

  try {
    if (target.barcode === null) {
      await prisma.beverage.update({
        where: { id: target.id },
        data: { barcode, source: "manual" },
      });
      revalidatePath("/", "layout");
      return { ok: true, data: { beverageId: target.id } };
    }

    const sibling = await prisma.beverage.create({
      data: {
        barcode,
        name: target.name,
        brand: target.brand,
        style: target.style,
        abv: target.abv,
        volumeMl: target.volumeMl,
        imageUrl: target.imageUrl,
        source: "manual",
      },
      select: { id: true },
    });
    revalidatePath("/", "layout");
    return { ok: true, data: { beverageId: sibling.id } };
  } catch (error) {
    // Lost the race between the check above and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.beverage.findUnique({ where: { barcode }, select: { id: true } });
      if (existing) {
        revalidatePath("/", "layout");
        return { ok: true, data: { beverageId: existing.id } };
      }
    }
    return fail("Couldn't save that barcode");
  }
}
