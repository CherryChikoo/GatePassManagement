"use client";

/**
 * The check-in QR's frame (instruction, the square, which scanner to use, "it
 * changes by itself") and the QR-shaped placeholder shown in the square while
 * the QR loads. Kept in this small file so the registers list can show the same
 * frame while the QR screen's code is still loading: nothing moves when the QR
 * arrives.
 */
import type { ReactNode } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { useT } from "@/components/providers/language-provider";

export function CheckInQrFrame({ inModal = false, children }: { inModal?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    // The QR: as large as the screen allows (in the pop-up: the pop-up's full width, no extra card)
    <section className={inModal ? undefined : "rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 sm:p-6 shadow-card"}>
      <p className="text-balance text-center text-lg font-semibold leading-snug text-zinc-100">
        {/* In the line, so a wrapped instruction stays centred with its icon */}
        <ScanLine className="-mt-0.5 mr-2 inline-block h-5 w-5 align-middle text-orange-500" aria-hidden="true" />
        {t("Scan with your phone camera to fill the form")}
      </p>
      <div
        className={
          inModal
            ? // Room left by the pop-up's title bar, its padding and the lines of text
              "mx-auto mt-3 aspect-square w-full max-w-[min(32rem,calc(100dvh-20rem))] min-w-[14rem]"
            : // Room left by the top bar, this screen's heading, the card's padding, the text and the bottom bar
              "mx-auto mt-4 aspect-square w-full max-w-[min(30rem,calc(100dvh-24rem))] min-w-[14rem]"
        }
      >
        {children}
      </div>
      {/* UPI apps treat the link as a payment and fail: say which scanner to use */}
      <p className="mt-3 text-balance text-center text-sm font-medium leading-snug text-zinc-200">
        {t("Use your phone's Camera or Google Lens (not PhonePe / Google Pay)")}
      </p>
      <p className="mt-1.5 text-balance text-center text-xs text-zinc-500">{t("The QR changes by itself every few minutes. Keep this screen open.")}</p>
    </section>
  );
}

/** Where a QR's three corner squares sit (margin 4 + 7 dots of about 41) */
const FINDERS = ["left-[10%] top-[10%]", "right-[10%] top-[10%]", "bottom-[10%] left-[10%]"];

/** Fills the QR's square while it loads: QR-shaped, so the space reads as "a QR is coming". */
export function CheckInQrPlaceholder() {
  const t = useT();
  return (
    <div role="status" className="relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-950/60 text-zinc-500">
      {FINDERS.map((pos) => (
        <span key={pos} aria-hidden="true" className={`absolute ${pos} h-[17%] w-[17%] rounded-xl border-[6px] border-zinc-800/80`}>
          <span className="absolute inset-[22%] rounded-md bg-zinc-800/80" />
        </span>
      ))}
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">{t("Getting the QR…")}</p>
    </div>
  );
}
