"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { getAccountSyncStatus, fixAccountSync, removeLoginWithoutPortal } from "@/server/actions/admin";
import { actionErrorMessage } from "@/lib/deployment";
import { ConfirmDialog } from "@/components/ui/alert-dialog";

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
  // Login waiting for the "Delete this login?" confirmation
  const [confirmLogin, setConfirmLogin] = useState<{ id: string; email: string } | null>(null);

  /** keepError: reloading after a fix — keep that fix's error on screen */
  const load = useCallback(async (keepError = false) => {
    if (!keepError) setError(null);
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
    setError(null);
    try {
      const res: any = await fixAccountSync();
      if (res.error) setError(res.error);
      else setNotice(`Fixed: ${res.deleted} removed, ${res.disabled} disabled (kept for history), ${res.emailsFixed} emails updated.`);
    } catch (err) {
      setError(actionErrorMessage(err, "Sync failed."));
    }
    setBusy(null);
    load(true);
  }

  function removeLogin(id: string, email: string) {
    setConfirmLogin({ id, email });
  }

  async function confirmRemoveLogin(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res: any = await removeLoginWithoutPortal(id);
      if (res.error) setError(res.error);
    } catch (err) {
      setError(actionErrorMessage(err, "Could not delete the login."));
    }
    setBusy(null);
    load(true);
  }

  // Stays out of the way: shown only when something needs attention
  if (!report && !error) return null;

  if (error && !report) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">{error}</span>
        <button
          onClick={() => load()}
          className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const r = report!;
  const orphans = r.portalWithoutLogin.filter((p) => !p.archived);
  const portalIssues = orphans.length + r.emailMismatch.length;

  // In sync: nothing to show (the confirmation after a fix still appears)
  if (r.inSync && !notice) return null;

  return (
    <>
    <ConfirmDialog
      open={!!confirmLogin}
      onClose={() => setConfirmLogin(null)}
      title="Delete this login?"
      description={confirmLogin ? `${confirmLogin.email} has no portal account, so it cannot be used. Its Supabase login will be removed.` : ""}
      confirmText="Delete login"
      variant="danger"
      onConfirm={() => confirmLogin && confirmRemoveLogin(confirmLogin.id)}
    />
    <div
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
        r.inSync ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 ${
              r.inSync ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {r.inSync ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </span>
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium text-zinc-100">
                Portal accounts: {r.portalCount - r.archivedCount} · Supabase logins: {r.loginCount}
              </span>
              <span className={`text-xs font-medium ${r.inSync ? "text-emerald-400" : "text-amber-400"}`}>
                {r.inSync ? "In sync" : "Out of sync"}
              </span>
            </p>
            {r.archivedCount > 0 && (
              <p className="mt-0.5 text-xs text-zinc-500">(+{r.archivedCount} archived for gate history, cannot sign in)</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {portalIssues > 0 && (
            <button
              onClick={fixPortal}
              disabled={busy !== null}
              className="inline-flex h-10 sm:h-9 flex-1 sm:flex-none items-center justify-center rounded-full bg-amber-500/15 px-4 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {busy === "fix" ? "Fixing…" : "Fix portal accounts"}
            </button>
          )}
          <button
            onClick={() => load()}
            disabled={busy !== null}
            className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors disabled:opacity-50"
            aria-label="Recheck"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {notice && <p className="text-xs text-emerald-300">{notice}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {orphans.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4 text-xs text-zinc-300">
          <p className="font-medium text-amber-300">Portal accounts with no login ({orphans.length}):</p>
          <ul className="mt-2 space-y-1">
            {orphans.slice(0, 10).map((p) => (
              <li key={p.id} className="break-words">
                {p.name} · {p.email} · {p.role}
              </li>
            ))}
            {orphans.length > 10 && <li className="text-zinc-500">…and {orphans.length - 10} more</li>}
          </ul>
        </div>
      )}

      {r.emailMismatch.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4 text-xs text-zinc-300">
          <p className="font-medium text-amber-300">Email differs between portal and login ({r.emailMismatch.length}):</p>
          <ul className="mt-2 space-y-1">
            {r.emailMismatch.map((m) => (
              <li key={m.profileId} className="break-words">
                portal {m.portalEmail} → login {m.loginEmail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.loginWithoutPortal.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4 text-xs text-zinc-300">
          <p className="font-medium text-amber-300">
            Supabase logins with no portal account ({r.loginWithoutPortal.length}) — they cannot use the portal:
          </p>
          <ul className="mt-2 divide-y divide-zinc-800/70">
            {r.loginWithoutPortal.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 break-all">{l.email || l.id}</span>
                <button
                  onClick={() => removeLogin(l.id, l.email)}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center rounded-full px-3 font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {busy === l.id ? "Deleting…" : "Delete login"}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-zinc-500 mt-2">To give one of these people access instead, create them in Create User with the same email after deleting the login.</p>
        </div>
      )}
    </div>
    </>
  );
}
