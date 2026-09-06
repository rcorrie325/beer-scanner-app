import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchBeverages } from "@/lib/queries";
import { searchQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Type-ahead for the manual "which beer is it?" list. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = searchQuerySchema.safeParse(
    new URL(request.url).searchParams.get("q") ?? "",
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad search" }, { status: 400 });
  }

  const beverages = await searchBeverages(parsed.data);
  return NextResponse.json({ beverages });
}
