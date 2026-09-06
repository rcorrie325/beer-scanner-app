import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Deliberately lightweight identity: no password, no email, no expiry.
 *
 * The cookie holds a User id and lasts ten years. "Logging out" means clearing
 * it and picking a name again. This is a party app on a phone that lives in
 * someone's pocket — the threat model is "my mate grabbed my phone and logged a
 * beer as me", which is a social problem, not a crypto one.
 */

export const USER_COOKIE = "beer_scanner_uid";

const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

/**
 * Returns the signed-in user, or null. Also returns null when the cookie points
 * at a user that no longer exists (e.g. after `npm run db:reset`), which the
 * pages treat exactly like "not signed in".
 */
export async function getCurrentUser(): Promise<User | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

/** Callable only from a Server Action or Route Handler. */
export async function setCurrentUser(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TEN_YEARS_SECONDS,
    // Over plain-HTTP LAN dev a Secure cookie would never be stored, so only
    // insist on it in production.
    secure: process.env.NODE_ENV === "production",
  });
}

/** Callable only from a Server Action or Route Handler. */
export async function clearCurrentUser(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
}
