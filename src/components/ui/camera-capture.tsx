"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";

/**
 * Taking a photo INSIDE the page (the browser's own camera view) instead of
 * opening the phone's camera app. On tablets with little memory Android closed
 * Chrome while the camera app was open ("Unable to complete previous operation
 * due to low memory"): the photo never came back and the form was lost.
 * Here Chrome never leaves the screen.
 *
 * open() → the photo as a File, null when cancelled, or "fallback" when the
 * in-page camera cannot run (no permission / old browser): the caller then
 * uses its file box as before.
 */
export type CameraResult = File | null | "fallback";

/** Longest side of the picture taken (it is shrunk again before upload) */
const MAX_SIDE = 1280;

export function useCamera() {
  const [request, setRequest] = useState<{ resolve: (r: CameraResult) => void } | null>(null);
  const open = useCallback(
    () =>
      new Promise<CameraResult>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return resolve("fallback");
        setRequest({ resolve });
      }),
    []
  );
  const element = request ? (
    <CameraSheet
      onDone={(r) => {
        request.resolve(r);
        setRequest(null);
      }}
    />
  ) : null;
  return { open, element };
}

function CameraSheet({ onDone }: { onDone: (r: CameraResult) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const done = useRef(false);

  const finish = useCallback(
    (r: CameraResult) => {
      if (done.current) return;
      done.current = true;
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
      onDone(r);
    },
    [onDone]
  );

  useEffect(() => {
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
      })
      // No permission / no camera: the file box takes over
      .catch(() => finish("fallback"));
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
    };
  }, [finish]);

  // Phone Back button / Escape: cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth || taking) return;
    setTaking(true);
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        // Free the picture memory at once (tablets are short of it)
        canvas.width = 0;
        canvas.height = 0;
        finish(blob ? new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }) : null);
      },
      "image/jpeg",
      0.85
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[400] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={t("Take photo")}>
      <div className="relative min-h-0 flex-1">
        <video
          ref={video}
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {!ready && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          onClick={() => finish(null)}
          aria-label={t("Go Back")}
          className="absolute left-4 top-4 inline-flex h-12 items-center gap-2 rounded-full bg-black/50 pl-2 pr-5 text-base font-bold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </span>
          {t("Go Back")}
        </button>
      </div>
      <div className="flex items-center justify-center bg-black px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          onClick={shoot}
          disabled={!ready || taking}
          aria-label={t("Take photo")}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-95 disabled:opacity-50"
        >
          <span className="h-[3.75rem] w-[3.75rem] rounded-full bg-white" />
        </button>
      </div>
    </div>,
    document.body
  );
}
