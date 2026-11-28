"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, Share, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { isInstalled, isIOS } from "@/lib/push/client";

const SEEN_KEY = "gatepass_iphone_alerts_hint";

/**
 * iPhone / iPad: Apple allows web alerts only for a portal added to the Home Screen.
 * A one-time card shows how (Share → Add to Home Screen); after that, alerts turn on
 * with the first tap like on every other device.
 */
export function IphoneAlertsHint() {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isIOS() || isInstalled()) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen) return;
    const id = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(id);
  }, []);
  // Leaves by itself after a few seconds (shown again on a later visit until closed)
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), 8_000);
    return () => clearTimeout(id);
  }, [show]);
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };
  if (!show) return null;
  return createPortal(
    <div className="fixed inset-x-3 top-3 z-[90] mx-auto max-w-md animate-in fade-in-0 slide-in-from-top-4 duration-300" role="dialog" aria-label={t("Turn on alerts")} data-keep>
      <div className="flex items-start gap-3 rounded-3xl border border-orange-500/15 bg-white p-4 shadow-[0_24px_50px_-20px_rgba(16,24,40,0.45)]">
        <span className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-zinc-100">{t("Turn on alerts")}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-zinc-500">
            {t("Tap")} <Share className="h-4 w-4 text-orange-600" aria-label={t("Share")} /> {t("then Add to Home Screen, and open the portal from there.")}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("Close")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
