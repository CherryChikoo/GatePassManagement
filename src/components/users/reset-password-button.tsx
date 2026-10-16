"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { actionErrorMessage } from "@/lib/deployment";
import { resetUserPassword } from "@/server/actions/admin";
import { cn } from "@/lib/utils";

/** Admin / HOD / Warden: set a new password for a student (Admin and HOD: faculty too). */
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
    "h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-3.5 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 transition-colors",
          className
        )}
      >
        <KeyRound className="h-3.5 w-3.5 text-zinc-500" /> Change password
      </button>
      <Modal open={open} onClose={close} title={`Change password — ${name}`}>
        {done ? (
          <div className="space-y-5">
            <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 leading-relaxed">
              Password changed for {name}. Give them the new password. The next time they sign in, they will see that their password was changed and by whom; they can set their own in Settings.
            </p>
            <button
              type="button"
              onClick={close}
              className="w-full h-12 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {error && (
              <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            )}
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
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950 hover:text-zinc-300 transition-colors"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500">At least 8 characters.</p>
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
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
