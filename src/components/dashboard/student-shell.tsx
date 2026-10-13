"use client";

import { useState } from "react";
import { Shield, LogOut } from "lucide-react";
import { logoutAndClear } from "@/stores/app-store";

/**
 * Minimal student layout: a slim top bar (brand, student, sign out) and the
 * page content. No sidebar or section navigation — the student dashboard is a
 * single screen (request form → pending status → QR pass).
 */
export function StudentShell({
  userName,
  userEmail,
  onLogout,
  children,
}: {
  userName: string;
  userEmail: string;
  onLogout: () => Promise<unknown> | void;
  children: React.ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = () => {
    if (signingOut) return;
    setSigningOut(true);
    void logoutAndClear(async () => onLogout());
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg shadow-orange-600/20">
              <Shield className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight">GatePass Portal</p>
              <p className="truncate text-xs text-zinc-500" title={userEmail}>
                {userName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
