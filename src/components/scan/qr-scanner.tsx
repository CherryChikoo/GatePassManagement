"use client";
import { useT } from "@/components/providers/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Flashlight, FlashlightOff, Keyboard, RotateCcw, X } from "lucide-react";

/**
 * Full-screen camera QR scanner.
 *
 * Speed: uses the phone's built-in QR reader (BarcodeDetector) when available;
 * otherwise jsQR on just the viewfinder square, ~7 times a second, reusing one
 * canvas — so the preview stays smooth and reads happen quickly.
 */

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

const SCAN_INTERVAL_MS = 140;
/** Part of the shorter video side analysed by jsQR (matches the on-screen square) */
const CROP = 0.8;
/** jsQR works on at most this many pixels per side */
const MAX_DECODE_SIDE = 520;
/** No scan for this long: the camera pauses (battery, heat) until "Scan again" */
const IDLE_PAUSE_MS = 90_000;

export function QrScanner({
  title = "Scan QR Code",
  hint = "Hold the QR code inside the square",
  onResult,
  onCancel,
  onClose,
  manualLabel = "Enter roll number instead",
}: {
  title?: string;
  hint?: string;
  onResult: (text: string) => void;
  onCancel: () => void;
  /** The ✕ button. Defaults to onCancel (the manual-entry button always uses onCancel). */
  onClose?: () => void;
  manualLabel?: string;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // Camera stopped on purpose (no scan for a while): shows "Scan again"
  const [paused, setPaused] = useState(false);
  // Bumped to start the camera again (back on the screen, camera ended, Try again)
  const [session, setSession] = useState(0);
  // Restarts done without the guard (camera ended / picture froze); "Scan again" resets it
  const autoRestartsRef = useRef(0);
  const restart = useCallback(() => {
    setError(null);
    setPaused(false);
    setStarting(true);
    setTorchOn(false);
    setSession((n) => n + 1);
  }, []);
  // The guard tapped "Scan again" / "Try again"
  const retry = useCallback(() => {
    autoRestartsRef.current = 0;
    restart();
  }, [restart]);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Latest callback, so the scanning effect never restarts the camera
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  /** One read attempt: built-in detector, or jsQR on the centre square. */
  const decodeOnce = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return null;

    if (detectorRef.current) {
      try {
        const codes = await detectorRef.current.detect(video);
        if (codes[0]?.rawValue) return codes[0].rawValue;
        return null;
      } catch {
        detectorRef.current = null; // fall back to jsQR
      }
    }

    const side = Math.floor(Math.min(video.videoWidth, video.videoHeight) * CROP);
    const sx = Math.floor((video.videoWidth - side) / 2);
    const sy = Math.floor((video.videoHeight - side) / 2);
    const size = Math.min(side, MAX_DECODE_SIDE);
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    return jsQR(img.data, size, size, { inversionAttempts: "dontInvert" })?.data || null;
  }, []);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    // A new camera session (first open, back on screen, after a stop)
    doneRef.current = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFrameTime = -1;
    let frozenTicks = 0;

    // The camera died on its own: start it again (at most twice), else ask the guard
    function recover() {
      stop();
      if (autoRestartsRef.current < 2 && document.visibilityState === "visible") {
        autoRestartsRef.current += 1;
        restart();
      } else {
        setPaused(true);
      }
    }

    function finish(text: string) {
      if (doneRef.current) return;
      doneRef.current = true;
      stop();
      try {
        navigator.vibrate?.(60);
      } catch {
        /* vibration is optional */
      }
      onResultRef.current(text);
    }

    // Read about 7 times a second; never overlaps a read in progress
    async function tick() {
      if (doneRef.current || cancelled) return;
      // Picture frozen for about 5 seconds while the camera says it is on
      const video = videoRef.current;
      if (video && document.visibilityState === "visible") {
        if (video.currentTime === lastFrameTime) frozenTicks += 1;
        else {
          frozenTicks = 0;
          lastFrameTime = video.currentTime;
        }
        if (frozenTicks * SCAN_INTERVAL_MS > 5000) {
          recover();
          return;
        }
      }
      const text = await decodeOnce();
      if (text) {
        finish(text);
        return;
      }
      if (!doneRef.current && !cancelled) timerRef.current = setTimeout(tick, SCAN_INTERVAL_MS);
    }

    async function start() {
      try {
        // The phone's own QR reader is much faster than JavaScript decoding
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          try {
            const formats: string[] = (await BD.getSupportedFormats?.()) ?? [];
            if (formats.includes("qr_code")) detectorRef.current = new BD({ formats: ["qr_code"] });
          } catch {
            detectorRef.current = null;
          }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // The phone may end the camera (screen off, another app, heat)
        if (track) {
          track.onended = () => {
            if (cancelled || doneRef.current) return;
            recover();
          };
        }
        // Nothing scanned for a while: pause the camera (battery, heat)
        idleTimer = setTimeout(() => {
          if (cancelled || doneRef.current) return;
          stop();
          setPaused(true);
        }, IDLE_PAUSE_MS);
        const caps: any = track?.getCapabilities?.() ?? {};
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
        }
        setTorchAvailable(!!caps.torch);
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStarting(false);
        tick();
      } catch {
        if (!cancelled) {
          setStarting(false);
          setError("Camera access is needed to scan. Allow camera access in the browser, or enter the roll number instead.");
        }
      }
    }
    // Screen locked / app switched: stop the camera; back on screen: start it again
    const onVisibility = () => {
      if (cancelled || doneRef.current) return;
      if (document.visibilityState === "hidden") stop();
      else restart();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      cancelled = true;
      doneRef.current = true;
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) track.onended = null;
      stop();
    };
  }, [decodeOnce, stop, restart, paused, session]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn((v) => !v);
    } catch {
      setTorchAvailable(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col" role="dialog" aria-modal="true" aria-label={t(title)}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />

      {/* Viewfinder: dim everything outside the square */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[72vmin] h-[72vmin] max-w-[420px] max-h-[420px] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
            "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
          ].map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-emerald-400 ${c}`} />
          ))}
          {!error && !starting && !paused && (
            <span className="absolute left-3 right-3 h-0.5 bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)] animate-qr-sweep" />
          )}
        </div>
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-base font-semibold">{t(title)}</h2>
        <button onClick={onClose ?? onCancel} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t("Close scanner")}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Bottom bar */}
      <div className="relative z-10 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 bg-gradient-to-t from-black/85 to-transparent space-y-3 text-center">
        {paused ? (
          <div className="mx-auto max-w-sm space-y-3 rounded-3xl bg-black/70 px-5 py-4">
            <p className="text-sm text-white/90">{t("Camera paused to save battery.")}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-base font-semibold text-black hover:bg-emerald-400"
            >
              <Camera className="h-5 w-5" /> {t("Scan again")}
            </button>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-sm space-y-3">
            <p className="text-sm text-red-200">{t(error)}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold hover:bg-white/25"
            >
              <RotateCcw className="h-4 w-4" /> {t("Try again")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/85">{starting ? t("Starting camera…") : t(hint)}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold ${torchOn ? "bg-amber-400 text-black" : "bg-white/10 hover:bg-white/20"}`}
              aria-pressed={torchOn}
            >
              {torchOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />} {t("Torch")}
            </button>
          )}
          <button onClick={onCancel} className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">
            <Keyboard className="h-4 w-4" /> {t(manualLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}
