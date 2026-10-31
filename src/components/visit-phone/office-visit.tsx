"use client";

/**
 * An office's QR poster, scanned with the visitor's phone camera (/o/<key>).
 * The visit this phone sent (remembered as "gp_visit") is marked "Visited
 * <office>" and the visitor's Exit QR opens on their visit page.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Loader2, QrCode, RotateCcw } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { fetchOffice, recordOfficeVisit, visitMessage, NETWORK } from "@/components/visit-phone/visit-api";
import { clearSavedVisit, readSavedVisit, type SavedVisit } from "@/components/visit-phone/visit-store";
import { StateCard, bigButtonCls, plainButtonCls } from "@/components/visit-phone/parts";

type Outcome =
  | { kind: "working" }
  /** No visit sent from this phone (or it is no longer known) */
  | { kind: "no-visit" }
  /** The poster is not in use */
  | { kind: "bad-poster" }
  | { kind: "error"; message: string; retry: boolean };

const POSTER_KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function OfficeVisit({ posterKey }: { posterKey: string }) {
  const t = useT();
  const router = useRouter();
  const wellFormed = POSTER_KEY_RE.test(posterKey);
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedVisit | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(wellFormed ? { kind: "working" } : { kind: "bad-poster" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wellFormed) return;
    let cancelled = false;
    setOutcome({ kind: "working" });
    const visit = readSavedVisit();
    setSaved(visit);

    // The office's name for the heading (shown while the visit is recorded)
    void fetchOffice(posterKey).then((res) => {
      if (!cancelled && res.ok) setOfficeName(res.name);
    });

    if (!visit) {
      setOutcome({ kind: "no-visit" });
      return;
    }
    void recordOfficeVisit(visit.secret, posterKey).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        // Inside: the Exit QR is open; left / turned away: that page says so
        router.replace(`/v/me/${visit.secret}`);
        return;
      }
      if (res.error === "not_found") {
        clearSavedVisit(visit.secret);
        setOutcome({ kind: "no-visit" });
      } else if (res.error === "This office QR is not in use. Please ask the office staff.") {
        setOutcome({ kind: "bad-poster" });
      } else {
        setOutcome({ kind: "error", message: visitMessage(t, res.error), retry: res.error === NETWORK || res.status >= 500 });
      }
    });
    return () => {
      cancelled = true;
    };
    // t only changes with the language; the visit is recorded once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterKey, wellFormed, attempt, router]);

  const heading = officeName ? (
    <p className="mb-4 flex items-center justify-center gap-2 text-center text-base font-medium text-zinc-300">
      <Building2 className="h-5 w-5 text-orange-500" aria-hidden="true" />
      {officeName}
    </p>
  ) : null;

  const myVisit = saved && (
    <Link href={`/v/me/${saved.secret}`} className={plainButtonCls}>
      {t("Open my visit")}
    </Link>
  );

  if (outcome.kind === "working") {
    return (
      <div>
        {heading}
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
          <p className="text-base">{t("Recording your office visit…")}</p>
        </div>
      </div>
    );
  }

  if (outcome.kind === "no-visit") {
    return (
      <div>
        {heading}
        <StateCard tone="info" icon={<QrCode />} title={t("No visit on this phone")}>
          <p>{t("First scan the QR shown by the security officer at the gate and send your details.")}</p>
          <p className="text-sm">{t("Use the same phone for the gate QR and this office QR.")}</p>
        </StateCard>
      </div>
    );
  }

  if (outcome.kind === "bad-poster") {
    return (
      <div className="space-y-4">
        <StateCard tone="bad" icon={<QrCode />} title={t("This office QR is not in use. Please ask the office staff.")} />
        {myVisit}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {heading}
      <StateCard tone="bad" icon={<Building2 />} title={t("Could not record the office visit")}>
        <p>{outcome.message}</p>
      </StateCard>
      {outcome.retry && (
        <button type="button" className={bigButtonCls} onClick={() => setAttempt((n) => n + 1)}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          {t("Try again")}
        </button>
      )}
      {myVisit}
    </div>
  );
}
