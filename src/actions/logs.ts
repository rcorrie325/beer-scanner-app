"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { fail, failFromZod, idSchema, logDrinkSchema, type ActionResult } from "@/lib/validation";

/**
 * Saves a drink and bounces back to Home with `?undo=<id>`, which is what makes
 * the undo toast appear. Keeping the just-saved id in the URL means undo works
 * without any client-side state to lose.
 */
export async function logDrinkAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const parsed = logDrinkSchema.safeParse({
    beverageId: formData.get("beverageId"),
    quantity: formData.get("quantity") ?? 1,
  });
  if (!parsed.success) return failFromZod(parsed.error);

  const beverage = await prisma.beverage.findUnique({
    where: { id: parsed.data.beverageId },
    select: { id: true },
  });
  if (!beverage) return fail("That beverage no longer exists");

  const log = await prisma.drinkLog.create({
    data: {
      userId: user.id,
      beverageId: beverage.id,
      quantity: parsed.data.quantity,
      // loggedAt defaults to now(), stored as UTC.
    },
    select: { id: true },
  });

  revalidatePath("/", "layout");
  redirect(`/?undo=${log.id}`);
}

/** The "+1 again" button on the recent list. */
export async function logAgainAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const parsed = idSchema.safeParse(formData.get("beverageId"));
  if (!parsed.success) redirect("/");

  const beverage = await prisma.beverage.findUnique({
    where: { id: parsed.data },
    select: { id: true },
  });
  if (!beverage) redirect("/");

  const log = await prisma.drinkLog.create({
    data: { userId: user.id, beverageId: beverage.id, quantity: 1 },
    select: { id: true },
  });

  revalidatePath("/", "layout");
  redirect(`/?undo=${log.id}`);
}

/**
 * Soft delete. Only the user who logged the drink can undo it, and the row is
 * kept so an accidental undo is recoverable from the database if anyone cares.
 * Every count query filters on `deletedAt: null`, so this drops out of the
 * leaderboard immediately.
 */
export async function undoLogAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const parsed = idSchema.safeParse(formData.get("logId"));
  if (!parsed.success) redirect("/");

  await prisma.drinkLog.updateMany({
    where: { id: parsed.data, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/", "layout");
  redirect("/");
}
