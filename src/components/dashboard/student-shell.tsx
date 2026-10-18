"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, Loader2 } from "lucide-react";
import { PAGE_FOOTER_SLOT_ID } from "@/components/ui/pager-bar";
import { PasswordChangedNotice } from "@/components/users/password-changed-notice";
import { logoutAndClear } from "@/stores/app-store";
import { SigningOutOverlay } from "@/components/ui/signing-out-overlay";
import { useT } from "@/components/providers/language-provider";

/**
 * Minimal student layout: a slim top bar (brand, student, sign out) and the
 * page content. No sidebar or section navigation — the student dashboard is a
 * single screen (request form → pending status → QR pass).
 */
export function StudentShell({
  userName,
  userEmail,
  avatarUrl = null,
  onLogout,
  children,
}: {
  userName: string;
  userEmail: string;
  /** Profile photo address (null: show the initial) */
  avatarUrl?: string | null;
  onLogout: () => Promise<unknown> | void;
  children: React.ReactNode;
}) {
  const t = useT();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutAndClear(async () => onLogout());
    } catch (err: any) {
      // A successful logout redirects; any other failure lets the user retry.
      if (!String(err?.digest ?? err?.message ?? "").includes("NEXT_REDIRECT")) {
        setSigningOut(false);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[22px] glass shadow-card px-3 sm:px-4 py-2.5">
          <Link href="/student" className="flex min-w-0 items-center gap-3 rounded-2xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 shadow-card">
              <Image src="/brand/logo-mark.webp" alt="Ramachandra College of Engineering" width={28} height={28} priority />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight">Gate Pass</p>
              <p className="truncate text-xs text-zinc-500" title={userEmail}>
                {userName}
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
          {/* Photo / initial → profile settings (name, phone, photo) */}
          <Link href="/settings" aria-label={t("Settings")} className="shrink-0 rounded-full focus-visible:ring-4 focus-visible:ring-orange-500/20">
            {avatarUrl ? (
               
              <img src={avatarUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-zinc-800 object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-sm font-semibold text-orange-400">
                {(userName || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            aria-busy={signingOut}
            aria-label={t("Sign out")}
            className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60 disabled:cursor-wait"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{signingOut ? t("Signing out…") : t("Sign out")}</span>
          </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PasswordChangedNotice />
        {children}
      </main>

      {/* Pagination bars (PagerBar) dock here: stays at the bottom of the screen */}
      <div
        id={PAGE_FOOTER_SLOT_ID}
        className="sticky bottom-0 z-30 mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] empty:hidden"
      />

      {signingOut && <SigningOutOverlay />}
    </div>
  );
}
