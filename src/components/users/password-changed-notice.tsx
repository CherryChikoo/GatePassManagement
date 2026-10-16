"use client";

import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";

const COOKIE = "gp_pw_notice";

type Notice = { by: string; role: string; at: string };

/**
 * One-time banner after sign-in when staff (Admin / HOD / Warden) changed this
 * user's password. Set by the sign-in action; read from a cookie, so it costs
 * no requests. Dismissing it clears the cookie.
 */
export function PasswordChangedNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
    if (!raw) return;
    try {
      setNotice(JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1))));
    } catch {
      document.cookie = `${COOKIE}=; path=/; max-age=0`;
    }
  }, []);

  if (!notice) return null;

  const dismiss = () => {
    document.cookie = `${COOKIE}=; path=/; max-age=0`;
    setNotice(null);
  };
  const when = notice.at
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(notice.at))
    : null;
  const who = [notice.by, notice.role && `(${notice.role})`].filter(Boolean).join(" ");

  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
        <KeyRound className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-amber-200">Your password was changed</p>
        <p className="mt-0.5 text-amber-300/90">
          {who ? `Changed by ${who}` : "Changed by staff"}
          {when ? ` on ${when}` : ""}. If you didn&apos;t ask for this, contact them or the administrator. You can set your own password in Settings.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-amber-400 hover:bg-amber-500/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
