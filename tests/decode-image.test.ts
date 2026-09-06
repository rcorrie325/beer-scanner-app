import { describe, expect, it } from "vitest";
import { decodeBarcodeFromImage } from "@/lib/decode-image";
import { renderEan13Jpeg, withCheckDigit, checkDigit } from "./support/ean13";

const CODE = withCheckDigit("500021300021"); // 5000213000212

describe("EAN-13 fixture generator", () => {
  it("computes check digits the way GS1 does", () => {
    expect(checkDigit("400638133393")).toBe(1);
    expect(withCheckDigit("500021300021")).toBe("5000213000212");
  });
});

describe("decodeBarcodeFromImage", () => {
  it("reads a clean barcode", async () => {
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(CODE));
    expect(result).toEqual({ status: "ok", barcode: CODE, engine: "zbar" });
  });

  it("survives the JPEG compression a phone upload gets", async () => {
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(CODE, { quality: 40 }));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.barcode).toBe(CODE);
  });

  it("reads a washed-out label", async () => {
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(CODE, { fade: 0.45 }));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.barcode).toBe(CODE);
  });

  it("reads a barcode photographed sideways", async () => {
    // Phones get held any which way, and this is the case ZXing alone cannot
    // do — it's the reason zbar has to actually load rather than quietly
    // falling through to the fallback.
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(CODE, { rotate90: true }));
    expect(result).toEqual({ status: "ok", barcode: CODE, engine: "zbar" });
  });

  it("reads a barcode at low resolution", async () => {
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(CODE, { scale: 2, height: 80 }));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.barcode).toBe(CODE);
  });

  it("reports no barcode for a blank picture rather than failing", async () => {
    // A barcode with zero-width bars is just a white rectangle.
    const blank = renderEan13Jpeg(CODE, { scale: 1, fade: 1 });
    const result = await decodeBarcodeFromImage(blank);
    expect(result.status).toBe("none");
  });

  it("rejects bytes that aren't an image", async () => {
    const result = await decodeBarcodeFromImage(new TextEncoder().encode("this is not a jpeg"));
    expect(result.status).toBe("unreadable");
  });

  it("normalises a UPC-A to 13 digits, matching a live scan of the same tin", async () => {
    // A UPC-A is an EAN-13 with a leading zero, so rendering one with the zero
    // and decoding it must come back in the same shape `normalizeBarcode` gives.
    const upcAsEan = withCheckDigit("003600029145");
    const result = await decodeBarcodeFromImage(renderEan13Jpeg(upcAsEan));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.barcode).toHaveLength(13);
      expect(result.barcode).toBe(upcAsEan);
    }
  });
});
