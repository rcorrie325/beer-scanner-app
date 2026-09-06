"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScanPhotoResponse } from "@/app/api/scan-photo/route";

/**
 * Scanner that takes a picture instead of watching a video stream.
 *
 * The whole point is what it *doesn't* need. `<input capture>` hands the job to
 * the phone's own camera app, and a file input isn't gated on a secure context
 * the way `getUserMedia` is — so this page works over plain HTTP with no
 * certificate and no tunnel, which is the part the live scanner can't do.
 * Decoding happens on the server, so every phone gets the same reader rather
 * than native-BarcodeDetector-or-ZXing depending on what it ships.
 *
 * What you give up is the retry loop. A video scanner takes four frames a
 * second and needs one to be sharp; here a blurry photo is just a failure the
 * user has to notice and repeat. That's why the failure text says what to
 * change rather than only that it didn't work.
 */

type Phase = "idle" | "reading" | "uploading" | "failed";

/**
 * Longest edge we upload. zbar reads barcodes at startlingly low resolution —
 * a couple of pixels per bar is enough — so this is about the upload being
 * quick on a phone, not about keeping detail.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export function PhotoScanner() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  /**
   * Re-encodes the photo small before it goes over the wire. Also normalises
   * away the phone's format — an iPhone may hand us HEIC, and the server only
   * reads JPEG.
   */
  const shrink = useCallback(async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("couldn't re-encode the photo");
    return blob;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setMessage(null);
      setLastBarcode(null);
      setPhase("reading");

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreview(url);

      let blob: Blob;
      try {
        blob = await shrink(file);
      } catch {
        setPhase("failed");
        setMessage("Couldn't read that photo. Try taking it again, or type the drink in.");
        return;
      }

      setPhase("uploading");
      const body = new FormData();
      body.append("photo", blob, "scan.jpg");

      let payload: ScanPhotoResponse;
      try {
        const response = await fetch("/api/scan-photo", { method: "POST", body });
        payload = (await response.json()) as ScanPhotoResponse;
      } catch {
        setPhase("failed");
        setMessage("Couldn't reach the server. Type the drink in instead.");
        return;
      }

      if (payload.status === "bad-request") {
        setPhase("failed");
        setMessage(`${payload.reason}. Type the drink in instead.`);
        return;
      }
      if (payload.status === "no-barcode") {
        setPhase("failed");
        setMessage(
          "No barcode in that shot. Fill more of the frame with it, hold steady, and avoid glare from the flash.",
        );
        return;
      }

      setLastBarcode(payload.barcode);

      switch (payload.result.status) {
        case "known":
          router.push(`/confirm/${payload.result.beverageId}`);
          return;
        case "unknown": {
          const params = new URLSearchParams({ barcode: payload.result.barcode });
          if (payload.result.brandHint) params.set("brand", payload.result.brandHint);
          router.push(`/add?${params}`);
          return;
        }
        case "error":
          setPhase("failed");
          setMessage(`${payload.result.reason}. Add it by hand instead.`);
          return;
        case "invalid":
          setPhase("failed");
          setMessage(payload.result.reason);
          return;
      }
    },
    [router, shrink],
  );

  const busy = phase === "reading" || phase === "uploading";
  const manualHref = lastBarcode ? `/add?barcode=${encodeURIComponent(lastBarcode)}` : "/add";

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-night-700 bg-night-900">
        {preview ? (
          // The photo is the user's only feedback about why a read failed —
          // blur and glare are obvious in the picture and invisible in a
          // message — so it stays on screen after a failure.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span aria-hidden className="text-4xl">
              📸
            </span>
            <p className="text-sm text-foam/70">
              Take a photo of the barcode. No camera permission needed — your phone&apos;s own
              camera app does it.
            </p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night-950/70 text-center">
            <span aria-hidden className="text-3xl">
              🔎
            </span>
            <p className="text-sm text-foam/80">
              {phase === "reading" ? "Preparing the photo…" : "Looking for a barcode…"}
            </p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // `environment` asks for the rear camera. Phones that ignore it fall
        // back to the photo library, which is a fine second option.
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clearing lets the same photo be retried after a failure.
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="tap w-full rounded-2xl bg-amber-glow px-6 font-semibold text-night-950 active:scale-95 disabled:opacity-50"
      >
        {busy ? "Working…" : preview ? "Take another photo" : "Take a photo"}
      </button>

      {message && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-deep/60 bg-night-900 px-4 py-3 text-sm text-amber-glow"
        >
          {message}
        </p>
      )}

      <Link
        href={manualHref}
        className="tap flex items-center justify-center rounded-2xl border border-night-700 bg-night-900 text-base font-medium"
      >
        {lastBarcode ? `Type it in (${lastBarcode})` : "Type it in instead"}
      </Link>

      <Link href="/scan" className="block text-center text-xs text-foam/40 underline">
        Use the live camera scanner instead
      </Link>
    </div>
  );
}
