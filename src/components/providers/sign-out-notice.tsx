"use client";

import { useEffect, useState } from "react";
import { Clock3, LogIn, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIGN_OUT_EVENT, SIGN_OUT_SECONDS, signOutNow, staySignedIn, type SignOutReason } from "@/lib/signed-out";

const RING = 2 * Math.PI * 42;

/**
 * The sign-out notice (src/lib/signed-out.ts): the portal's own card with a
 * coral countdown ring. "No activity" can be cancelled; "session ended" only
 * leads to the sign-in page. Never shown to Security (they sign out only by Log out).
 */
export function SignOutNotice() {
  const [reason, setReason] = useState<SignOutReason | null>(null);
  const [left, setLeft] = useState(SIGN_OUT_SECONDS);

  useEffect(() => {
    const open = (e: Event) => {
      setLeft(SIGN_OUT_SECONDS);
      setReason((e as CustomEvent<SignOutReason>).detail);
    };
    window.addEventListener(SIGN_OUT_EVENT, open);
    return () => window.removeEventListener(SIGN_OUT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!reason) return;
    if (left <= 0) {
      signOutNow(reason);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [reason, left]);

  if (!reason) return null;
  const idle = reason === "idle";
  const Icon = idle ? Clock3 : ShieldAlert;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full max-w-sm rounded-3xl border border-zinc-800/80 bg-zinc-900 p-6 sm:p-7 text-center shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] animate-scale-in">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/15 bg-orange-500/10 text-orange-500">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="sign-out-title" className="mt-4 text-xl font-semibold tracking-tight text-zinc-100">
          {idle ? "Still there?" : "Your session has ended"}
        </h2>

        {/* Countdown */}
        <div className="relative mx-auto mt-5 h-28 w-28" aria-live="polite">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id="sign-out-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff634a" />
                <stop offset="100%" stopColor="#c2381f" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-zinc-800" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              stroke="url(#sign-out-ring)"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - Math.max(0, left) / SIGN_OUT_SECONDS)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-light tabular-nums text-zinc-100">
            {Math.max(0, left)}
          </span>
        </div>

        <div className="mt-6 space-y-2.5">
          {idle ? (
            <>
              <Button size="lg" className="w-full" onClick={() => { setReason(null); staySignedIn(); }}>
                Stay signed in
              </Button>
              <Button size="lg" variant="ghost" className="w-full" onClick={() => signOutNow(reason)}>
                <LogOut className="h-4 w-4" /> Sign out now
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full" onClick={() => signOutNow(reason)}>
              <LogIn className="h-4 w-4" /> Sign in again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
