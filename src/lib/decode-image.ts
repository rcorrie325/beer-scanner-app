/**
 * Reads a barcode out of a photo, on the server.
 *
 * This is the other half of the upload-a-photo scanner: the phone never runs a
 * decoder, it just sends a JPEG. That trade buys two things. A file input isn't
 * gated on a secure context the way `getUserMedia` is, so the page works over
 * plain HTTP with no certificate; and every phone gets the same decoder instead
 * of native-BarcodeDetector-or-ZXing depending on what it happens to ship.
 *
 * What it costs is the live feedback loop. A video scanner gets ~4 frames a
 * second and only needs one of them to be sharp; a photo gets one attempt, and
 * a blurry one just fails. That's the thing worth measuring before this
 * replaces anything.
 *
 * Two decoders run in order because they fail differently. zbar is the stronger
 * reader for 1D codes off a real label — it's what most desktop scanners use —
 * and ZXing is already a dependency for the client fallback, so a second
 * attempt costs nothing but a few milliseconds on images that were going to
 * fail anyway.
 */

import jpeg from "jpeg-js";
import { normalizeBarcode } from "@/lib/barcode";

export type DecodeImageResult =
  | { status: "ok"; barcode: string; engine: "zbar" | "zxing" }
  /** The picture decoded fine; there was no barcode we could read in it. */
  | { status: "none" }
  /** The bytes weren't a usable image at all. */
  | { status: "unreadable"; reason: string };

/** Above this, decoding costs more than the detail is worth. */
const MAX_PIXELS = 12_000_000;

type Raster = { data: Uint8Array; width: number; height: number };

function toRaster(bytes: Uint8Array): Raster | { error: string } {
  let decoded;
  try {
    decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "not a JPEG" };
  }
  if (!decoded?.width || !decoded?.height) return { error: "image had no dimensions" };
  if (decoded.width * decoded.height > MAX_PIXELS) return { error: "image too large" };
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

async function readWithZbar(raster: Raster): Promise<string | null> {
  try {
    // scanRGBABuffer rather than scanImageData: the latter wants a real DOM
    // ImageData, which doesn't exist here.
    const { scanRGBABuffer } = await import("@undecaf/zbar-wasm");
    const buffer = raster.data.buffer.slice(
      raster.data.byteOffset,
      raster.data.byteOffset + raster.data.byteLength,
    ) as ArrayBuffer;
    const symbols = await scanRGBABuffer(buffer, raster.width, raster.height);

    for (const symbol of symbols) {
      const normalized = normalizeBarcode(symbol.decode());
      if (normalized) return normalized;
    }
  } catch (error) {
    // A decoder that won't load shouldn't take the request with it — but it
    // must not do so quietly either. Falling through to ZXing on every image
    // looks like "photos are hard to read" rather than "zbar never started",
    // and that misreads as a limit of the approach instead of a broken build.
    console.error("[decode-image] zbar unavailable, falling back to ZXing:", error);
  }
  return null;
}

async function readWithZxing(raster: Raster): Promise<string | null> {
  try {
    const { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } =
      await import("@zxing/library");

    // RGBLuminanceSource wants one packed integer per pixel, not RGBA bytes.
    const packed = new Int32Array(raster.width * raster.height);
    for (let i = 0, p = 0; i < packed.length; i++, p += 4) {
      packed[i] = (raster.data[p] << 16) | (raster.data[p + 1] << 8) | raster.data[p + 2];
    }

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    const source = new RGBLuminanceSource(packed, raster.width, raster.height);
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)));
    return normalizeBarcode(result.getText());
  } catch {
    // ZXing throws NotFoundException as flow control when there's nothing there.
    return null;
  }
}

/**
 * Finds the first readable EAN-8/EAN-13/UPC-A in a JPEG.
 *
 * The result is already normalised to 13 digits by `normalizeBarcode`, so a
 * UPC-A photographed here and the same tin scanned live end up as one Beverage
 * row rather than two.
 */
export async function decodeBarcodeFromImage(bytes: Uint8Array): Promise<DecodeImageResult> {
  const raster = toRaster(bytes);
  if ("error" in raster) return { status: "unreadable", reason: raster.error };

  const zbar = await readWithZbar(raster);
  if (zbar) return { status: "ok", barcode: zbar, engine: "zbar" };

  const zxing = await readWithZxing(raster);
  if (zxing) return { status: "ok", barcode: zxing, engine: "zxing" };

  return { status: "none" };
}
