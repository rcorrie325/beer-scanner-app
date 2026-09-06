/**
 * Takes a photo, gives back the same answer a live scan would.
 *
 * The decode happens here and then hands off to `resolveBarcodeAction`, which
 * is the exact function the camera scanner calls. That's deliberate: whichever
 * way a barcode arrives, it hits the same cache, the same Open Food Facts
 * lookup and the same brand-guessing, so the two scanners can't drift apart or
 * create competing Beverage rows for one tin.
 */

import { NextResponse } from "next/server";
import { decodeBarcodeFromImage } from "@/lib/decode-image";
import { resolveBarcodeAction, type ResolveBarcodeResult } from "@/actions/beverages";

/** zbar is WebAssembly and jpeg-js wants Buffer, so this can't run on edge. */
export const runtime = "nodejs";

/**
 * The client downscales before uploading, so anything near this is either a
 * phone that ignored it or someone posting at the endpoint directly.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export type ScanPhotoResponse =
  | { status: "resolved"; barcode: string; engine: "zbar" | "zxing"; result: ResolveBarcodeResult }
  /** The image was fine, there just wasn't a readable barcode in it. */
  | { status: "no-barcode" }
  | { status: "bad-request"; reason: string };

export async function POST(request: Request): Promise<NextResponse<ScanPhotoResponse>> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "bad-request", reason: "Send the photo as form data" }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ status: "bad-request", reason: "No photo in the request" }, { status: 400 });
  }
  if (photo.size === 0) {
    return NextResponse.json({ status: "bad-request", reason: "That photo was empty" }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json({ status: "bad-request", reason: "That photo is too big" }, { status: 413 });
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const decoded = await decodeBarcodeFromImage(bytes);

  if (decoded.status === "unreadable") {
    return NextResponse.json({ status: "bad-request", reason: "Couldn't read that as a photo" }, { status: 400 });
  }
  if (decoded.status === "none") {
    return NextResponse.json({ status: "no-barcode" });
  }

  const result = await resolveBarcodeAction(decoded.barcode);
  return NextResponse.json({
    status: "resolved",
    barcode: decoded.barcode,
    engine: decoded.engine,
    result,
  });
}
