"use client";

/**
 * Meeting code at the gate: the visitor tells Security the 4-digit code the
 * person they met gave them. Head Security / Main Admin can instead let the
 * visitor out with a written reason (forgotten code, person unreachable…).
 *
 * VisitCodeFields: the inputs (used inside a form, e.g. the register's Out form)
 * VisitExitDialog: a popup with the inputs (Visitors Book "Mark exit")
 */
import { useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Modal } from "@/components/ui/primitives";

export type VisitExitInput = { visitCode?: string; visitOverride?: string };

export function VisitCodeFields({
  hostName,
  canOverride,
  locked = false,
  value,
  onChange,
}: {
  hostName: string;
  canOverride: boolean;
  /** Too many wrong codes: only the override is left */
  locked?: boolean;
  value: VisitExitInput;
  onChange: (v: VisitExitInput) => void;
}) {
  const t = useT();
  const overriding = value.visitOverride !== undefined;
  return (
    <div className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-zinc-200">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <span>{t("Ask the visitor for the 4-digit meeting code {name} gave them.", { name: hostName })}</span>
      </p>
      {!overriding && !locked && (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          aria-label={t("Meeting code")}
          placeholder="• • • •"
          value={value.visitCode ?? ""}
          onChange={(e) => onChange({ visitCode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          className="h-16 w-full rounded-2xl border border-zinc-800 bg-zinc-900 text-center font-mono text-3xl font-semibold tracking-[0.5em] text-zinc-100 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
      )}
      {canOverride &&
        (overriding ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-200" htmlFor="visit-override">
              <ShieldAlert className="h-4 w-4 text-amber-500" /> {t("Reason for letting out without the code")}
            </label>
            <textarea
              id="visit-override"
              rows={2}
              maxLength={300}
              autoFocus
              value={value.visitOverride}
              placeholder={t("e.g. Faculty on leave; confirmed by phone")}
              onChange={(e) => onChange({ visitOverride: e.target.value })}
              className="flex min-h-[72px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
            {!locked && (
              <button type="button" onClick={() => onChange({ visitCode: "" })} className="text-xs font-medium text-orange-500 underline-offset-2 hover:underline">
                {t("Enter the code instead")}
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => onChange({ visitOverride: "" })} className="text-xs font-medium text-amber-600 underline-offset-2 hover:underline">
            {t("Let out without the code (Head Security)")}
          </button>
        ))}
      {locked && !canOverride && (
        <p className="text-sm text-red-500">{t("Code locked after 5 wrong tries. Ask Head Security to let the visitor out.")}</p>
      )}
    </div>
  );
}

/** The input is ready to send: 4 digits, or a reason of at least 5 letters. */
export function visitInputReady(v: VisitExitInput): boolean {
  if (v.visitOverride !== undefined) return v.visitOverride.trim().length >= 5;
  return /^\d{4}$/.test(v.visitCode ?? "");
}

type ExitResult = { success: boolean; error?: string; locked?: boolean; canOverride?: boolean; triesLeft?: number };

/** A server message on screen in the guard's language, plus the tries left after a wrong code. */
export function visitExitMessage(
  t: (s: string, v?: Record<string, string | number>) => string,
  res: { error?: string; triesLeft?: number; locked?: boolean }
): string {
  const msg = t(res.error ?? "Could not mark the exit");
  return res.error === "Wrong code." && !res.locked && typeof res.triesLeft === "number"
    ? `${msg} ${t("{n} tries left.", { n: res.triesLeft })}`
    : msg;
}

/** Popup for marking a visitor out with their meeting code. */
export function VisitExitDialog({
  open,
  onClose,
  visitorName,
  hostName,
  canOverride,
  locked: lockedAtStart = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  visitorName: string;
  hostName: string;
  canOverride: boolean;
  locked?: boolean;
  /** Returns the server's answer; a success closes the popup */
  onSubmit: (input: { code?: string; overrideReason?: string }) => Promise<ExitResult>;
}) {
  const t = useT();
  const [value, setValue] = useState<VisitExitInput>({ visitCode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(lockedAtStart);

  const submit = async () => {
    if (!visitInputReady(value) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(value.visitOverride !== undefined ? { overrideReason: value.visitOverride } : { code: value.visitCode });
      if (res.success) {
        setValue({ visitCode: "" });
        onClose();
        return;
      }
      setError(visitExitMessage(t, res));
      if (res.locked) {
        setLocked(true);
        if (canOverride) setValue({ visitOverride: "" });
      } else if (value.visitOverride === undefined) setValue({ visitCode: "" });
    } catch {
      setError(t("Could not mark the exit. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={t("Mark exit — {name}", { name: visitorName })} className="max-w-md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <VisitCodeFields hostName={hostName} canOverride={canOverride} locked={locked} value={value} onChange={setValue} />
        {error && (
          <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !visitInputReady(value)}
          className="inline-flex h-14 sm:h-12 w-full items-center justify-center gap-2 rounded-full bg-sky-600 text-base font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
          {busy ? t("Checking…") : t("Check code & mark exit")}
        </button>
      </form>
    </Modal>
  );
}
