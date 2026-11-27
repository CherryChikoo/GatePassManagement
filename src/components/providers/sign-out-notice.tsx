"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { SIGN_OUT_EVENT, SIGN_OUT_SECONDS, signOutNow, staySignedIn, type SignOutReason } from "@/lib/signed-out";

const R = 46;
const RING = 2 * Math.PI * R;

/**
 * "Are you there?" after a long time without use (src/lib/signed-out.ts):
 * the portal's card with a coral countdown ring; no answer → signed out.
 * Never shown to Security (they sign out only by Log out). A login that is
 * no longer accepted is signed out at once, without this card.
 */
export function SignOutNotice() {
  const [reason, setReason] = useState<SignOutReason | null>(null);
  const [left, setLeft] = useState(SIGN_OUT_SECONDS);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const open = (e: Event) => {
      setLeft(SIGN_OUT_SECONDS);
      setLeaving(false);
      setReason((e as CustomEvent<SignOutReason>).detail);
    };
    window.addEventListener(SIGN_OUT_EVENT, open);
    return () => window.removeEventListener(SIGN_OUT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!reason || leaving) return;
    if (left <= 0) {
      setLeaving(true);
      signOutNow(reason);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [reason, left, leaving]);

  if (!reason) return null;
  const shown = Math.max(0, left);
  const leave = () => {
    setLeaving(true);
    signOutNow(reason);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="are-you-there">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full max-w-[22rem] overflow-hidden rounded-[28px] border border-zinc-800/80 bg-zinc-900 shadow-[0_30px_70px_-24px_rgba(16,24,40,0.45)] animate-scale-in">
        {/* Soft coral glow behind the ring */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#ff634a]/15 blur-3xl" aria-hidden="true" />

        <div className="relative px-7 pb-7 pt-8 text-center">
          <div className="relative mx-auto h-[7.5rem] w-[7.5rem]" aria-live="polite">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="are-you-there-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ff8a73" />
                  <stop offset="100%" stopColor="#c2381f" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r={R} fill="none" strokeWidth="4" className="stroke-zinc-800" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                stroke="url(#are-you-there-ring)"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - shown / SIGN_OUT_SECONDS)}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-baseline justify-center pt-[2.4rem] tabular-nums">
              <span className="text-[2.6rem] font-light leading-none tracking-tight text-zinc-100">{shown}</span>
              <span className="ml-0.5 text-sm font-medium text-zinc-500">s</span>
            </span>
          </div>

          <h2 id="are-you-there" className="mt-5 text-2xl font-light tracking-tight text-zinc-100">
            Are you <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">there?</span>
          </h2>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={leave}
              disabled={leaving}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm font-semibold text-zinc-300 transition-[background-color,border-color,transform] hover:border-zinc-700 hover:bg-zinc-900 active:scale-[0.98] disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setReason(null);
                staySignedIn();
              }}
              disabled={leaving}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#ffa14a] to-[#f26b12] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_22px_-12px_rgba(242,107,18,0.75)] ring-1 ring-inset ring-white/20 transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-60"
            >
              I&apos;m here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
