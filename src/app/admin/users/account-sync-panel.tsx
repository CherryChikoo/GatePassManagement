"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { getAccountSyncStatus, fixAccountSync, removeLoginWithoutPortal } from "@/server/actions/admin";
import { actionErrorMessage } from "@/lib/deployment";

type Report = {
  loginCount: number;
  portalCount: number;
  inSync: boolean;
  archivedCount: number;
  portalWithoutLogin: { id: string; name: string; email: string; role: string; active: boolean; archived: boolean }[];
  loginWithoutPortal: { id: string; email: string; createdAt: string }[];
  emailMismatch: { profileId: string; portalEmail: string; loginEmail: string }[];
};

/**
 * Shows whether portal accounts and Supabase Auth logins match exactly, with
 * one-click fixes. (Database triggers keep them in sync live; this is the
 * visible check and the manual repair tool.)
 */
export function AccountSyncPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res: any = await getAccountSyncStatus();
      if (res.error) setError(res.error);
      else setReport(res.report);
    } catch (err) {
      setError(actionErrorMessage(err, "Could not check account sync."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function fixPortal() {
    setBusy("fix");
    setNotice(null);
    try {
      const res: any = await fixAccountSync();
      if (res.error) setError(res.error);
      else setNotice(`Fixed: ${res.deleted} removed, ${res.disabled} disabled (kept for history), ${res.emailsFixed} emails updated.`);
    } catch (err) {
      setError(actionErrorMessage(err, "Sync failed."));
    }
    setBusy(null);
    load();
  }

  async function removeLogin(id: string, email: string) {
    if (!window.confirm(`Delete the login ${email}? It has no portal account, so it cannot be used.`)) return;
    setBusy(id);
    try {
      const res: any = await removeLoginWithoutPortal(id);
      if (res.error) setError(res.error);
    } catch (err) {
      setError(actionErrorMessage(err, "Could not delete the login."));
    }
    setBusy(null);
    load();
  }

  if (!report && !error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-400 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking portal ⇄ Supabase account sync…
      </div>
    );
  }

  if (error && !report) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 flex items-center justify-between gap-2">
        <span>{error}</span>
        <button onClick={load} className="underline">Retry</button>
      </div>
    );
  }

  const r = report!;
  const orphans = r.portalWithoutLogin.filter((p) => !p.archived);
  const portalIssues = orphans.length + r.emailMismatch.length;

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-2 ${
        r.inSync ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {r.inSync ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          <span className="font-semibold text-zinc-100">
            Portal accounts: {r.portalCount - r.archivedCount} · Supabase logins: {r.loginCount}
          </span>
          {r.archivedCount > 0 && (
            <span className="text-xs text-zinc-500">(+{r.archivedCount} archived for gate history, cannot sign in)</span>
          )}
          <span className={r.inSync ? "text-emerald-300" : "text-amber-300"}>
            {r.inSync ? "In sync" : "Out of sync"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {portalIssues > 0 && (
            <button
              onClick={fixPortal}
              disabled={busy !== null}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {busy === "fix" ? "Fixing…" : "Fix portal accounts"}
            </button>
          )}
          <button onClick={load} disabled={busy !== null} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200" aria-label="Recheck">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {notice && <p className="text-xs text-emerald-300">{notice}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {orphans.length > 0 && (
        <div className="text-xs text-zinc-300">
          <p className="font-semibold text-amber-200">Portal accounts with no login ({orphans.length}):</p>
          <ul className="mt-1 space-y-0.5">
            {orphans.slice(0, 10).map((p) => (
              <li key={p.id}>
                {p.name} · {p.email} · {p.role}
              </li>
            ))}
            {orphans.length > 10 && <li>…and {orphans.length - 10} more</li>}
          </ul>
        </div>
      )}

      {r.emailMismatch.length > 0 && (
        <div className="text-xs text-zinc-300">
          <p className="font-semibold text-amber-200">Email differs between portal and login ({r.emailMismatch.length}):</p>
          <ul className="mt-1 space-y-0.5">
            {r.emailMismatch.map((m) => (
              <li key={m.profileId}>
                portal {m.portalEmail} → login {m.loginEmail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.loginWithoutPortal.length > 0 && (
        <div className="text-xs text-zinc-300">
          <p className="font-semibold text-amber-200">
            Supabase logins with no portal account ({r.loginWithoutPortal.length}) — they cannot use the portal:
          </p>
          <ul className="mt-1 space-y-1">
            {r.loginWithoutPortal.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span>{l.email || l.id}</span>
                <button
                  onClick={() => removeLogin(l.id, l.email)}
                  disabled={busy !== null}
                  className="text-red-300 hover:text-red-200 underline disabled:opacity-50"
                >
                  {busy === l.id ? "Deleting…" : "Delete login"}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-zinc-500 mt-1">To give one of these people access instead, create them in Create User with the same email after deleting the login.</p>
        </div>
      )}
    </div>
  );
}
