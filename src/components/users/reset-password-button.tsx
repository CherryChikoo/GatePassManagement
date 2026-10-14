"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { actionErrorMessage } from "@/lib/deployment";
import { resetUserPassword } from "@/server/actions/admin";

/** Admin / HOD: set a new password for a student or faculty member. */
export function ResetPasswordButton({ profileId, name, className = "" }: { profileId: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setPassword("");
    setConfirm("");
    setError(null);
    setDone(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("The two passwords do not match");
    setBusy(true);
    setError(null);
    try {
      const res: any = await resetUserPassword(profileId, password);
      if (res?.error) setError(res.error);
      else setDone(true);
    } catch (err) {
      setError(actionErrorMessage(err, "Could not change the password."));
    }
    setBusy(false);
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-zinc-700/50 bg-zinc-900 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 ${className}`}
      >
        <KeyRound className="h-3.5 w-3.5" /> Reset password
      </button>
      <Modal open={open} onClose={close} title={`Reset password — ${name}`}>
        {done ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Password changed. Give the new password to {name}; they can change it later in Settings.
            </p>
            <button type="button" onClick={close} className="w-full h-10 rounded-xl border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
            <div className="space-y-1.5">
              <label htmlFor="rp-new" className="block text-sm font-medium text-zinc-300">New password *</label>
              <div className="relative">
                <input
                  id="rp-new"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">At least 8 characters.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rp-confirm" className="block text-sm font-medium text-zinc-300">Confirm new password *</label>
              <input
                id="rp-confirm"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
