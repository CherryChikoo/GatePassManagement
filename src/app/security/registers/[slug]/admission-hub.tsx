"use client";

/**
 * Admission Book & Pass (Security): the same 4 buttons as the Visitors Book —
 * Show QR (the parent fills the form on their phone), Type it myself (the
 * register's own new-entry form), Inside now (today's records still waiting
 * for Out, with how long), Old records (the register's usual list).
 * Screens open in place: ?view=qr|new|inside|log.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FilePlus2, History, MapPin, PencilLine, QrCode, School } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { GoBackButton } from "@/components/ui/go-back-button";
import { Card, CardContent } from "@/components/ui/card";
import { HubBackButton, HubTiles, useHubView } from "@/components/visits/hub-tiles";
import { CheckInQrScreen } from "@/components/visits/checkin-qr-screen";
import { ARRIVAL_COUNTS_QUERY } from "@/components/visits/arrival-alert";
import { visitExitMessage } from "@/components/visits/visit-code";
import { EntryRegisterView } from "@/components/registers/entry-register-view";
import { RegisterForm, clearRegisterDraft } from "@/components/registers/register-form";
import { invalidateEntryLists } from "@/components/registers/entry-list-cache";
import { fetchInsideEntries } from "@/components/registers/inside-entries";
import { localizeRegister } from "@/components/registers/localize";
import { newClientToken } from "@/components/registers/format";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { useLiveTopics } from "@/lib/realtime/live";
import { actionErrorMessage } from "@/lib/deployment";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import type { EntryRegister } from "@/lib/registers/definitions";
import type { ArrivalCounts } from "@/server/actions/visit-requests";

const VIEWS = ["qr", "new", "inside", "log"] as const;

export function AdmissionHub({ register, canCreate }: { register: EntryRegister; canCreate: boolean }) {
  const t = useT();
  // Display copy in the guard's language (saved values and validation stay on the original)
  const def = useMemo(() => localizeRegister(register, t), [register, t]);
  const { view, go, back } = useHubView(VIEWS);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Parents waiting after scanning the QR (shared copy with the arrival pop-up)
  const arrivals = useGateData<ArrivalCounts | { error: string }>(
    view === "hub" ? ARRIVAL_COUNTS_QUERY.key : null,
    ARRIVAL_COUNTS_QUERY.fetch,
    ARRIVAL_COUNTS_QUERY.topics
  );
  const waiting = arrivals.data && "ADMISSION" in arrivals.data ? arrivals.data.ADMISSION : 0;

  // "Inside now (n)": from the same list pages the register shows (usually cached)
  const [insideCount, setInsideCount] = useState<number | null>(null);
  const [countNo, setCountNo] = useState(0);
  useEffect(() => {
    if (view !== "hub") return;
    let cancelled = false;
    fetchInsideEntries(register, true)
      .then((r) => !cancelled && setInsideCount(r.entries.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, register, countNo]);
  // Live: a record saved / let out at any gate, or a parent sent the form
  useLiveTopics(
    [`reg:${register.key}`, ...ARRIVAL_COUNTS_QUERY.topics],
    (changed) => {
      if (changed.includes("*") || changed.includes(`reg:${register.key}`)) setCountNo((n) => n + 1);
    },
    view === "hub"
  );

  // ── Type it myself: the register's own form, on its own screen ──
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);
  const openView = (v: (typeof VIEWS)[number]) => {
    setNotice(null);
    setFormError(null);
    go(v);
  };
  async function save(payload: Parameters<Parameters<typeof RegisterForm>[0]["onSubmit"]>[0]) {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res: any = await callGate("createRegisterEntry", [register.key, payload, token]);
      if (res?.error) {
        setFormError(visitExitMessage(t, res));
        scrollPageToTop();
      } else {
        clearRegisterDraft(register.key);
        invalidateEntryLists(register.key);
        setToken(newClientToken());
        setFormKey((k) => k + 1);
        setNotice(t("Record saved."));
        // Saved: Inside now, the new record in it (Back still returns to the buttons)
        go("inside", { replace: true });
      }
    } catch (err) {
      setFormError(actionErrorMessage(err, t("Could not save. Please try again.")));
      scrollPageToTop();
    }
    setBusy(false);
  }

  const noticeBox = notice && (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
    </div>
  );

  if (view === "qr") {
    return <CheckInQrScreen register="ADMISSION" onBack={back} />;
  }

  if (view === "hub") {
    return (
      <div className="space-y-5">
        <div>
          <GoBackButton className="mb-3" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <School className="h-5 w-5" />
            </span>
            <h1 className="min-w-0 text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 break-words">{def.title}</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{def.description}</p>
        </div>
        {noticeBox}
        <HubTiles
          tiles={[
            ...(canCreate
              ? [
                  {
                    key: "qr",
                    icon: QrCode,
                    title: t("Show QR"),
                    hint: t("The parent scans it and fills the form on their phone"),
                    badge: waiting > 0 ? t("{n} waiting", { n: waiting }) : null,
                    primary: true,
                    onClick: () => openView("qr"),
                  },
                  {
                    key: "new",
                    icon: PencilLine,
                    title: t("Type it myself"),
                    hint: t("Fill the admission details here"),
                    onClick: () => openView("new"),
                  },
                ]
              : []),
            {
              key: "inside",
              icon: MapPin,
              title: t("Inside now"),
              hint: t("Who is inside, and record Out"),
              count: insideCount,
              onClick: () => openView("inside"),
            },
            {
              key: "log",
              icon: History,
              title: t("Old records"),
              hint: t("Records of any day"),
              onClick: () => openView("log"),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <HubBackButton className="mb-3" onClick={back} />
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
            {view === "new" ? <FilePlus2 className="h-5 w-5" /> : view === "inside" ? <MapPin className="h-5 w-5" /> : <History className="h-5 w-5" />}
          </span>
          <h1 className="min-w-0 text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 break-words">
            {view === "new" ? t("New entry") : view === "inside" ? t("Inside now") : t("Old records")}
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{def.title}</p>
      </div>

      {view === "new" &&
        (canCreate ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardContent className="p-5 sm:p-6">
                {formError && (
                  <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}
                <RegisterForm key={formKey} def={def} staff={[]} busy={busy} onSubmit={(payload) => void save(payload)} />
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("You cannot add records to this register.")}</p>
        ))}

      {view === "inside" && (
        <>
          {noticeBox}
          <EntryRegisterView def={def} canCreate={canCreate} insideOnly />
        </>
      )}

      {view === "log" && <EntryRegisterView def={def} canCreate={canCreate} />}
    </div>
  );
}
