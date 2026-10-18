"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";
import { REGISTER_BY_KEY, isEntryRegister, type EntryRegister, type RegisterDef, type RegisterKey } from "@/lib/registers/definitions";
import { createRegisterEntry, getRegisterStaffOptions } from "@/server/actions/registers";
import { RegisterForm, type StaffOption } from "./register-form";
import { newClientToken } from "./format";
import { localizeRegister } from "./localize";

/**
 * "+" from the registers list: the new-entry form opens right there. After each
 * save the form clears for the next person, so a queue of 10+ people can be
 * logged without leaving the list.
 */
export function QuickEntryModal({
  registerKey,
  def: givenDef,
  onClose,
  onSaved,
}: {
  registerKey: string;
  /** The definition when it isn't built in (portal-created registers) */
  def?: RegisterDef;
  onClose: () => void;
  /** e.g. refresh the "N today" counts */
  onSaved?: () => void;
}) {
  const t = useT();
  const def = useMemo(() => {
    const d = givenDef ?? REGISTER_BY_KEY[registerKey as RegisterKey];
    return d && isEntryRegister(d) ? (localizeRegister(d, t) as EntryRegister) : null;
  }, [givenDef, registerKey, t]);

  const needsStaff = !!def?.fields.some((f) => f.type === "staff");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    if (needsStaff) getRegisterStaffOptions().then(setStaff).catch(() => setStaff([]));
  }, [needsStaff]);

  // A fresh token per entry: a retried save of the same entry is stored once
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // Bumped on every save result, so the popup scrolls up to the "Saved" / error message
  const [resultNo, setResultNo] = useState(0);

  if (!def) return null;

  async function submit(payload: Parameters<typeof createRegisterEntry>[1]) {
    if (!def) return;
    setBusy(true);
    setError(null);
    try {
      const res: any = await createRegisterEntry(def.key, payload, token);
      if (res?.error) {
        setError(res.error);
      } else {
        setSavedCount((n) => n + 1);
        setToken(newClientToken());
        setFormKey((k) => k + 1); // blank form for the next person
        onSaved?.();
      }
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not save. Please try again.")));
    }
    setBusy(false);
    setResultNo((n) => n + 1);
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={`${t("New entry")} — ${def.title}`} className="max-w-2xl" scrollTopKey={resultNo}>
      <div className="space-y-4">
        {savedCount > 0 && (
          <div role="status" className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">{t("Saved. Ready for the next one.")}</span>
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
              {t("{n} saved", { n: savedCount })}
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <RegisterForm key={formKey} def={def} staff={staff} busy={busy} onSubmit={submit} />
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-full h-12 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium text-zinc-200 hover:bg-zinc-950 transition-colors disabled:opacity-50"
        >
          {t("Go Back")}
        </button>
      </div>
    </Modal>
  );
}
