"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveBarcodeAction } from "@/actions/beverages";
import { normalizeBarcode } from "@/lib/barcode";

/**
 * Camera scanner with two engines and a lot of ways to bail out gracefully.
 *
 *  - `BarcodeDetector` (Chrome/Android) is used when present: it's native, fast
 *    and costs no bundle weight.
 *  - Everywhere else — notably iOS Safari, which has no BarcodeDetector — we
 *    lazily import ZXing. The import only happens on the devices that need it.
 *
 * Both engines read the entire video frame — `detect(video)` and
 * `decodeFromStream` are handed the element, not a cropped region — so a
 * barcode anywhere in the picture counts. The overlay is decoration only.
 *
 * Every failure path ends at manual entry rather than at a dead end: insecure
 * context, permission denied, no camera, unsupported browser, Open Food Facts
 * being down. You can always log a drink.
 */

type Phase =
  | "checking"
  | "insecure"
  | "ready" // waiting for the user to start the camera
  | "starting"
  | "scanning"
  | "resolving"
  | "denied"
  | "nocamera"
  | "failed";

/** Ignore repeat reads of the same code inside this window. */
const DUPLICATE_SCAN_MS = 3000;
/** How often we ask the native detector for a frame. */
const DETECT_INTERVAL_MS = 250;

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

export function Scanner() {
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);

  /** Guards against firing two lookups from one physical scan. */
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("checking");
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  const stopEverything = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Handling a decoded barcode                                             */
  /* ---------------------------------------------------------------------- */

  const handleDetection = useCallback(
    async (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!code) return;

      const now = Date.now();
      const last = lastScanRef.current;

      // A single physical scan produces a burst of identical reads. Take the
      // first, ignore the rest for a few seconds.
      if (busyRef.current) return;
      if (last && last.code === code && now - last.at < DUPLICATE_SCAN_MS) return;

      busyRef.current = true;
      lastScanRef.current = { code, at: now };
      setLastBarcode(code);
      setPhase("resolving");
      setMessage(null);

      navigator.vibrate?.(40);

      try {
        const result = await resolveBarcodeAction(code);

        switch (result.status) {
          case "known":
            stopEverything();
            router.push(`/confirm/${result.beverageId}`);
            return;
          case "unknown": {
            stopEverything();
            const params = new URLSearchParams({ barcode: result.barcode });
            if (result.brandHint) params.set("brand", result.brandHint);
            router.push(`/add?${params}`);
            return;
          }
          case "error":
            setMessage(`${result.reason}. Add it by hand instead.`);
            setPhase("scanning");
            break;
          case "invalid":
            setMessage(result.reason);
            setPhase("scanning");
            break;
        }
      } catch {
        setMessage("Lookup failed. Add it by hand instead.");
        setPhase("scanning");
      } finally {
        busyRef.current = false;
      }
    },
    [router, stopEverything],
  );

  /* ---------------------------------------------------------------------- */
  /* Engine wiring                                                          */
  /* ---------------------------------------------------------------------- */

  const startNativeLoop = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !window.BarcodeDetector) return false;

    let detector: BarcodeDetector;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
      detector = new window.BarcodeDetector({ formats });
    } catch {
      return false;
    }

    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || busyRef.current) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) void handleDetection(codes[0].rawValue);
      } catch {
        // Transient decode errors are normal while the picture is moving.
      }
    }, DETECT_INTERVAL_MS);

    return true;
  }, [handleDetection]);

  const startZxing = useCallback(
    async (stream: MediaStream): Promise<boolean> => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current ?? undefined,
          (result) => {
            if (result) void handleDetection(result.getText());
          },
        );
        zxingControlsRef.current = controls;
        return true;
      } catch {
        return false;
      }
    },
    [handleDetection],
  );

  const start = useCallback(async () => {
    setPhase("starting");
    setMessage(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPhase("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPhase("nocamera");
      } else {
        setPhase("failed");
        setMessage(error instanceof Error ? error.message : "Couldn't open the camera");
      }
      return;
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can be refused; the stream is still attached and usable.
      }
    }

    if (await startNativeLoop()) {
      setEngine("native");
      setPhase("scanning");
      return;
    }

    if (await startZxing(stream)) {
      setEngine("zxing");
      setPhase("scanning");
      return;
    }

    stopEverything();
    setPhase("failed");
    setMessage("No barcode reader available in this browser.");
  }, [startNativeLoop, startZxing, stopEverything]);

  /* ---------------------------------------------------------------------- */
  /* Secure-context gate + teardown                                         */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    // getUserMedia only exists in a secure context. Over plain HTTP on a LAN
    // address the API is simply absent, which would otherwise look like a
    // broken scanner rather than a fixable setup problem.
    if (!window.isSecureContext) {
      setPhase("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("nocamera");
      return;
    }
    setPhase("ready");
  }, []);

  useEffect(() => stopEverything, [stopEverything]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const manualHref = lastBarcode ? `/add?barcode=${encodeURIComponent(lastBarcode)}` : "/add";
  const live = phase === "scanning" || phase === "resolving" || phase === "starting";

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-night-700 bg-night-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${live ? "" : "opacity-0"}`}
        />

        {live && (
          /*
           * Corner marks, not a cut-out window. Both engines already decode the
           * whole video frame, so dimming everything outside a small strip was
           * telling people the opposite of the truth — they lined cans up with
           * the box and waited for it to catch. These mark the live area
           * without implying anything outside them is dead.
           */
          <div className="pointer-events-none absolute inset-0 p-3">
            <div className="relative h-full w-full">
              <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-2xl border-l-2 border-t-2 border-amber-glow/60" />
              <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-r-2 border-t-2 border-amber-glow/60" />
              <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-2xl border-b-2 border-l-2 border-amber-glow/60" />
              <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-2xl border-b-2 border-r-2 border-amber-glow/60" />
            </div>
          </div>
        )}

        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <PhaseArt phase={phase} />
            <p className="text-sm text-foam/70">{phaseText(phase)}</p>
            {phase === "ready" && (
              <button
                type="button"
                onClick={() => void start()}
                className="tap rounded-2xl bg-amber-glow px-6 font-semibold text-night-950 active:scale-95"
              >
                Turn on camera
              </button>
            )}
            {(phase === "denied" || phase === "failed") && (
              <button
                type="button"
                onClick={() => void start()}
                className="tap rounded-2xl border border-night-700 px-6 text-sm font-medium active:scale-95"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {phase === "resolving" && (
          <div className="absolute inset-x-0 bottom-0 bg-night-950/80 px-4 py-3 text-center text-sm">
            Looking up {lastBarcode}…
          </div>
        )}
      </div>

      {message && (
        <p role="alert" className="rounded-2xl border border-amber-deep/60 bg-night-900 px-4 py-3 text-sm text-amber-glow">
          {message}
        </p>
      )}

      {phase === "scanning" && (
        <p className="text-center text-xs text-foam/40">
          Anywhere in frame works · {engine === "native" ? "native detector" : "ZXing fallback"}
        </p>
      )}

      <Link
        href={manualHref}
        className="tap flex items-center justify-center rounded-2xl border border-night-700 bg-night-900 text-base font-medium"
      >
        {lastBarcode ? `Type it in (${lastBarcode})` : "Type it in instead"}
      </Link>

      <Link href="/scan" className="block text-center text-xs text-foam/40 underline">
        Photo a barcode instead (works without HTTPS)
      </Link>
    </div>
  );
}

function phaseText(phase: Phase): string {
  switch (phase) {
    case "checking":
      return "Checking the camera…";
    case "insecure":
      // There's a working scanner one tap away now, so this no longer sends
      // people to the README to set up certificates.
      return "The live camera needs HTTPS. Photo a barcode instead — that works here.";
    case "ready":
      return "The camera stays off until you turn it on.";
    case "denied":
      return "Camera permission denied. Allow it in your browser settings, or just type the drink in.";
    case "nocamera":
      return "No camera available on this device — use manual entry.";
    case "failed":
      return "The scanner couldn't start. Manual entry always works.";
    default:
      return "";
  }
}

function PhaseArt({ phase }: { phase: Phase }) {
  const icon =
    phase === "insecure" ? "🔒" : phase === "denied" ? "🚫" : phase === "ready" ? "📷" : "⚠️";
  return (
    <span aria-hidden className="text-4xl">
      {icon}
    </span>
  );
}
