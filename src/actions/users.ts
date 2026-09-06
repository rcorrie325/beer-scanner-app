"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { clearCurrentUser, setCurrentUser } from "@/lib/session";
import { displayNameSchema, failFromZod, idSchema, type ActionResult } from "@/lib/validation";

/**
 * Sign in by typing a name. If somebody with that name already exists we adopt
 * them rather than making a near-duplicate — at a party "Dave" means one Dave,
 * and two rows called "dave"/"Dave" would split his count in half.
 */
export async function signInWithNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) return failFromZod(parsed.error);

  const displayName = parsed.data;

  // Case-insensitive match done in JS: Prisma's `mode: "insensitive"` is
  // Postgres-only, and this has to behave the same on both databases.
  const existing = (await prisma.user.findMany({ select: { id: true, displayName: true } })).find(
    (u) => u.displayName.toLowerCase() === displayName.toLowerCase(),
  );

  const user = existing ?? (await prisma.user.create({ data: { displayName } }));

  await setCurrentUser(user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Tap an existing name on the picker — for the phone being passed around. */
export async function selectUserAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formData.get("userId"));
  if (!parsed.success) redirect("/welcome");

  const user = await prisma.user.findUnique({ where: { id: parsed.data } });
  if (!user) redirect("/welcome");

  await setCurrentUser(user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Clears the cookie and goes back to the pick-or-create screen. */
export async function switchUserAction(): Promise<void> {
  await clearCurrentUser();
  revalidatePath("/", "layout");
  redirect("/welcome");
}
