"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { logoutAndClear } from "@/stores/app-store";
import { logoutAction } from "@/server/actions/auth";
import { SigningOutOverlay } from "@/components/ui/signing-out-overlay";

/** Standalone sign-out button (e.g. on the Access Denied page) with a loading state. */
export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          try {
            await logoutAndClear(logoutAction);
          } catch {
            setPending(false);
          }
        }}
        className={className}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        {pending ? "Signing out…" : "Sign Out"}
      </button>
      {pending && <SigningOutOverlay />}
    </>
  );
}
