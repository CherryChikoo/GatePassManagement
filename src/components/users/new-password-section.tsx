"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

/**
 * "Login password" part of the Admin's Edit form: empty keeps the current
 * password, anything typed becomes the new one when the form is saved
 * (resetUserPassword). The field is named "newPassword".
 */
export function NewPasswordSection({ sectionCls, labelCls }: { sectionCls: string; labelCls: string }) {
  const [show, setShow] = useState(false);
  return (
    <section className={sectionCls}>
      <h3 className={labelCls}>
        <KeyRound className="h-3.5 w-3.5 text-orange-400" /> Login Password
      </h3>
      <label htmlFor="edit-new-password" className="block text-sm font-medium text-zinc-300">
        New password
      </label>
      <div className="relative mt-1.5">
        <input
          id="edit-new-password"
          name="newPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          placeholder="Leave empty to keep the current password"
          className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-4 pr-12 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        At least 8 characters. Give the new password to the person; next time they sign in they are told it was changed.
      </p>
    </section>
  );
}
