"use client";

/**
 * The visitor's own visit, on their phone (/v/me/<secret>): waiting for
 * Security → inside (how to leave: meeting code, office poster, or Security
 * marks the exit) → Exit QR → left. Also "turned away" and "timed out".
 *
 * The phone cannot get live pings (no login), so it asks the tiny status
 * route now and then: every 3 s for the first 2 minutes while waiting, then
 * every 10 s; every 25 s while inside (10 s while the Exit QR is shown, and
 * always before the QR runs out); never while the page is hidden, and at once
 * when it is shown again. Everything comes back from the address and the
 * server, so a page reload (new deployment) loses nothing.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Building2, CheckCircle2, Clock, Hourglass, KeyRound, Loader2, LogOut, QrCode, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { fetchVisitStatus, sendMeetingCode, visitMessage, type VisitExitWay, type VisitStatus } from "@/components/visit-phone/visit-api";
import { clearSavedVisit, isVisitSecret, readSavedVisit, saveVisit } from "@/components/visit-phone/visit-store";
import { OfflineNote, PhoneAlert, PhoneLoading, StateCard, bigButtonCls } from "@/components/visit-phone/parts";

/** Exit QR life when the phone's clock cannot be trusted (the server gives 2 minutes) */
const QR_FALLBACK_MS = 110_000;

type Shown = {
  s: VisitStatus;
  /** When the Exit QR stops working, on this phone's clock (null: no QR) */
  qrUntil: number | null;
};

type Problem = "offline" | "busy" | "server" | null;

const FINAL = new Set<VisitStatus["status"]>(["REJECTED", "EXITED", "EXPIRED"]);

/** The Exit QR's end on this phone's clock, robust to a phone clock that is off */
function qrDeadline(s: VisitStatus, now: number): number | null {
  if (!s.exitQr || !s.exitQrExpiresAt) return null;
  const left = Date.parse(s.exitQrExpiresAt) - now;
  return now + (left > 5_000 && left <= 125_000 ? left : QR_FALLBACK_MS);
}

export function VisitStatusView({ secret }: { secret: string }) {
  const t = useT();
  const valid = isVisitSecret(secret);
  const [shown, setShown] = useState<Shown | null>(null);
  /** Unknown / replaced secret: scan the gate QR again */
  const [gone, setGone] = useState(!valid);
  const [problem, setProblem] = useState<Problem>(null);
  const [checking, setChecking] = useState(false);
  // Set by the polling loop: show a status answered by another call (code, office) / check now
  const takeRef = useRef<(s: VisitStatus) => void>(() => {});
  const checkRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!valid) return;
    let stopped = false;
    let done = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // "First 2 minutes" count from when the form was sent (also across reloads)
    const saved = readSavedVisit();
    const since = saved?.secret === secret ? saved.at : Date.now();

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = (ms: number | null) => {
      stop();
      if (ms !== null && !stopped && !done && !document.hidden) timer = setTimeout(() => void check(), ms);
    };

    const nextDelay = (s: VisitStatus, qrUntil: number | null): number | null => {
      const now = Date.now();
      if (s.status === "PENDING") return now - since < 120_000 ? 3_000 : 10_000;
      if (s.status === "INSIDE") {
        if (qrUntil) return Math.max(2_000, Math.min(10_000, qrUntil - now - 20_000));
        return 25_000;
      }
      return null;
    };

    const take = (s: VisitStatus) => {
      const qrUntil = qrDeadline(s, Date.now());
      setShown({ s, qrUntil });
      setProblem(null);
      if (FINAL.has(s.status)) {
        done = true;
        stop();
        clearSavedVisit(secret);
        return;
      }
      // An office poster scanned later finds this visit (unless another one is followed here)
      const cur = readSavedVisit();
      if (!cur || cur.secret === secret) saveVisit({ secret, register: s.register, at: since });
      schedule(nextDelay(s, qrUntil));
    };

    async function check() {
      stop();
      if (stopped || done || busy || document.hidden) return;
      busy = true;
      setChecking(true);
      const res = await fetchVisitStatus(secret);
      busy = false;
      if (stopped) return;
      setChecking(false);
      if (res.ok) {
        take(res);
        return;
      }
      if (res.error === "not_found") {
        done = true;
        clearSavedVisit(secret);
        setGone(true);
        return;
      }
      setProblem(res.status === 0 ? "offline" : res.status === 429 ? "busy" : "server");
      schedule(res.status === 429 ? 60_000 : res.status === 0 ? 8_000 : 15_000);
    }

    takeRef.current = take;
    checkRef.current = () => void check();

    const onShow = () => {
      if (document.hidden) stop();
      else void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onShow);
    void check();
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onShow);
    };
  }, [secret, valid]);

  if (gone) {
    return (
      <StateCard tone="info" icon={<QrCode />} title={t("Visit not found")}>
        <p>{t("Please scan the QR shown by the security officer at the gate again.")}</p>
      </StateCard>
    );
  }

  if (!shown) {
    return (
      <div className="space-y-4">
        <PhoneLoading />
        {problem && <OfflineNote text={problemText(t, problem)} />}
      </div>
    );
  }

  const { s, qrUntil } = shown;
  const note = problem && <OfflineNote text={problemText(t, problem)} />;
  const checkNow = !FINAL.has(s.status) && (
    <button
      type="button"
      onClick={() => checkRef.current()}
      disabled={checking}
      className="mx-auto flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-zinc-500 hover:text-zinc-200 disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} aria-hidden="true" />
      {t("Check now")}
    </button>
  );

  if (s.status === "PENDING") {
    return (
      <div className="space-y-4">
        <StateCard tone="wait" icon={<Hourglass className="animate-pulse" />} title={t("Request sent, please wait")}>
          <p>{t("The security officer will check your details and let you in.")}</p>
          <p className="text-sm">{t("Keep this page open.")}</p>
        </StateCard>
        <WhoCard s={s} />
        {note}
        {checkNow}
      </div>
    );
  }

  if (s.status === "REJECTED") {
    return (
      <div className="space-y-4">
        <StateCard tone="bad" icon={<XCircle />} title={t("Please speak to the security officer.")}>
          {s.rejectReason && <p>{t("Reason: {reason}", { reason: t(s.rejectReason) })}</p>}
        </StateCard>
      </div>
    );
  }

  if (s.status === "EXITED") {
    return (
      <StateCard tone="ok" icon={<LogOut />} title={t("Thank you, your exit is recorded.")}>
        <p>{t("Have a safe journey.")}</p>
      </StateCard>
    );
  }

  if (s.status === "EXPIRED") {
    return (
      <StateCard tone="info" icon={<Clock />} title={t("Your request has timed out")}>
        <p>{t("Please scan the QR shown by the security officer at the gate again.")}</p>
      </StateCard>
    );
  }

  // Inside the campus
  return (
    <div className="space-y-4">
      <StateCard tone="ok" icon={<CheckCircle2 />} title={t("You're inside the campus")}>
        {s.insideSince && <p className="text-sm">{t("Since {time}", { time: formatTime(s.insideSince) })}</p>}
      </StateCard>

      {s.exitQr && qrUntil ? (
        <ExitQr s={s} value={s.exitQr} until={qrUntil} />
      ) : (
        <LeaveCard s={s} secret={secret} onStatus={(next) => takeRef.current(next)} onGone={() => setGone(true)} />
      )}

      <WhoCard s={s} />
      {note}
      {checkNow}
    </div>
  );
}

function problemText(t: (s: string) => string, p: Exclude<Problem, null>): string {
  if (p === "offline") return t("No internet connection. Trying again…");
  if (p === "busy") return t("Too many checks. Trying again in a minute…");
  return t("Could not check just now. Trying again…");
}

/** Name and register, so the officer can match the phone with the request */
function WhoCard({ s }: { s: VisitStatus }) {
  const t = useT();
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm">
      <p className="text-zinc-500">{t(s.register === "VISITORS" ? "Visitors Book & Pass" : "Admission Book & Pass")}</p>
      <p className="mt-0.5 text-base font-medium text-zinc-100">{s.name}</p>
    </div>
  );
}

/** How to leave, before the Exit QR is open */
function LeaveCard({
  s,
  secret,
  onStatus,
  onGone,
}: {
  s: VisitStatus;
  secret: string;
  onStatus: (s: VisitStatus) => void;
  onGone: () => void;
}) {
  const t = useT();
  const exit = s.exit;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <LogOut className="h-5 w-5 text-orange-500" aria-hidden="true" />
          {t("When you leave")}
        </h2>
        {exit.kind === "CODE" ? (
          <CodeEntry exit={exit} secret={secret} onStatus={onStatus} onGone={onGone} />
        ) : exit.kind === "OFFICE" ? (
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500" aria-hidden="true">
              <Building2 className="h-5 w-5" />
            </span>
            <p className="text-base leading-relaxed text-zinc-300">
              {exit.officeName
                ? t("When your work is done, scan the QR poster at {office} with your phone camera.", { office: exit.officeName })
                : t("When your work is done, scan the QR poster at the office with your phone camera.")}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500" aria-hidden="true">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <p className="text-base leading-relaxed text-zinc-300">{t("When you leave, the security officer will mark your exit.")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The 4-digit code from the person met: unlocks the Exit QR */
function CodeEntry({
  exit,
  secret,
  onStatus,
  onGone,
}: {
  exit: Extract<VisitExitWay, { kind: "CODE" }>;
  secret: string;
  onStatus: (s: VisitStatus) => void;
  onGone: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedNow, setLockedNow] = useState(false);
  const locked = exit.locked || lockedNow;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 4) return;
    setBusy(true);
    setError(null);
    const res = await sendMeetingCode(secret, code);
    setBusy(false);
    if (res.ok) {
      onStatus(res);
      return;
    }
    if (res.error === "not_found") {
      clearSavedVisit(secret);
      onGone();
      return;
    }
    setCode("");
    if (res.locked) {
      setLockedNow(true);
      return;
    }
    const msg = visitMessage(t, res.error);
    setError(
      res.error === "Wrong code." && typeof res.triesLeft === "number" ? `${msg} ${t("{n} tries left.", { n: res.triesLeft })}` : msg
    );
  }

  if (locked) {
    return (
      <PhoneAlert>{t("The code is locked after 5 wrong tries. Please speak to the security officer at the gate.")}</PhoneAlert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="flex items-start gap-2 text-base leading-relaxed text-zinc-300">
        <KeyRound className="mt-1 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        <span>
          {exit.hostName
            ? t("After your meeting, ask {name} for the 4-digit code and type it here.", { name: exit.hostName })
            : t("After your meeting, ask the person you met for the 4-digit code and type it here.")}
        </span>
      </p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={4}
        aria-label={t("Meeting code")}
        placeholder="• • • •"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="h-16 w-full rounded-2xl border border-zinc-800 bg-zinc-900 text-center font-mono text-3xl font-semibold tracking-[0.5em] text-zinc-100 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
      />
      {error && <PhoneAlert>{error}</PhoneAlert>}
      <button type="submit" className={bigButtonCls} disabled={busy || code.length !== 4}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <QrCode className="h-5 w-5" aria-hidden="true" />}
        {t("Show my Exit QR")}
      </button>
    </form>
  );
}

/** Large Exit QR (black on white) for Security's Scan QR; a new one comes before it runs out */
function ExitQr({ s, value, until }: { s: VisitStatus; value: string; until: number }) {
  const t = useT();
  const [img, setImg] = useState<{ value: string; url: string } | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 560, margin: 4, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setImg({ value, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value]);

  // Past its time: never show a QR that no longer works
  useEffect(() => {
    const ms = until - Date.now();
    setStale(ms <= 0);
    if (ms <= 0) return;
    const timer = setTimeout(() => setStale(true), ms);
    return () => clearTimeout(timer);
  }, [until]);

  const exit = s.exit;
  return (
    <Card>
      <CardContent className="space-y-4 p-5 text-center">
        <h2 className="text-xl font-semibold text-zinc-100">{t("Your Exit QR")}</h2>
        {exit.kind === "OFFICE" && exit.visited && exit.officeName && (
          <p className="text-sm font-medium text-emerald-600">{t("Visited {office}", { office: exit.officeName })}</p>
        )}
        <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl bg-white p-1">
          {img && img.value === value ? (
            <img
              src={img.url}
              alt={t("Exit QR")}
              className={cn("aspect-square w-full [image-rendering:pixelated] transition-opacity", stale && "opacity-10")}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-hidden="true" />
            </div>
          )}
          {stale && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-700">
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
              <p className="text-sm font-medium">{t("Getting a new QR…")}</p>
            </div>
          )}
        </div>
        <p className="text-base font-medium leading-relaxed text-zinc-200">{t("Show this QR to the security officer at the gate.")}</p>
        <p className="text-xs text-zinc-500">{t("It changes every 2 minutes. Keep this page open.")}</p>
      </CardContent>
    </Card>
  );
}
