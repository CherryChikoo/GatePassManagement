"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";
import { REGISTER_BY_KEY, isEntryRegister, type EntryRegister, type RegisterDef, type RegisterKey } from "@/lib/registers/definitions";
import { callGate } from "@/lib/gate-call";
import { invalidateEntryLists } from "./entry-list-cache";
import type { createRegisterEntry } from "@/server/actions/registers";
import { RegisterForm, restoreRegisterDraft, takeRegisterDraft, type StaffOption } from "./register-form";
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
    if (needsStaff) callGate("getRegisterStaffOptions", [], 15_000).then((s: any) => setStaff(Array.isArray(s) ? s : [])).catch(() => setStaff([]));
  }, [needsStaff]);

  // A fresh token per entry: a retried save of the same entry is stored once
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);
  // Saves still running (the form is already blank for the next person)
  const [saving, setSaving] = useState(0);
  const busy = saving > 0;
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // Bumped on every save result, so the popup scrolls up to the "Saved" / error message
  const [resultNo, setResultNo] = useState(0);

  if (!def) return null;


  async function submit(payload: Parameters<typeof createRegisterEntry>[1]) {
    if (!def) return;
    const tok = token;
    // Blank form for the next person at once; the typed copy is put back if the save fails
    const kept = takeRegisterDraft(def.key);
    setError(null);
    setToken(newClientToken());
    setFormKey((k) => k + 1);
    setSaving((n) => n + 1);
    // The blank form for the next person: back to the top at once (not after the server answers)
    setResultNo((n) => n + 1);
    let res: any;
    try {
      res = await callGate("createRegisterEntry", [def.key, payload, tok]);
    } catch (err) {
      res = { error: actionErrorMessage(err, t("Could not save. Please try again.")), keepToken: true };
    }
    setSaving((n) => n - 1);
    if (res?.error) {
      setError(res.error);
      restoreRegisterDraft(def.key, kept);
      if (res.keepToken) setToken(tok); // a retry of the same entry is stored once
      setFormKey((k) => k + 1); // the form shows what was typed again
    } else {
      setSavedCount((n) => n + 1);
      // Opening this register next shows the new record (not a cached list)
      invalidateEntryLists(def.key);
      onSaved?.();
    }
    setResultNo((n) => n + 1);
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={def.title} className="max-w-2xl md:max-w-[min(92vw,1000px)] border-2 border-orange-500/80" scrollTopKey={resultNo}>
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
        {saving > 0 && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("Saving…")}
          </p>
        )}
        {/* The blank form is ready for the next person while the last one saves */}
        <RegisterForm key={formKey} def={def} staff={staff} busy={false} onSubmit={submit} />
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t("Go Back")}
          title={t("Go Back")}
          className="flex w-full h-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </Modal>
  );
}
