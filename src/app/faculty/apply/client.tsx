"use client";

import { DateField } from "@/components/ui/date-field";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar as CalendarIcon, Clock, Phone, FileText, Send, CheckCircle2, History, LogIn, LogOut, Search, QrCode, ShieldCheck, X } from "lucide-react";
import { createFacultyPermissionRequest, cancelFacultyPermissionRequest } from "@/server/actions/faculty-permissions";
import { generateLiveQrToken } from "@/server/actions/permissions";
import { istDateString } from "@/lib/time/ist";
import { FACULTY_REQUEST_TYPES, facultyRequestDays, facultyRequestTypeLabel } from "@/lib/registers/definitions";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, StatusBadge, Modal } from "@/components/ui/primitives";
import { PagerBar } from "@/components/ui/pager-bar";
import { formatDateTime, formatDate } from "@/lib/utils";
import { useStoreReady } from "@/components/providers/store-hydrator";
import QRCode from "qrcode";

type TabState = "APPLY" | "HISTORY";

/** "12 Oct 2026" or "12 Oct 2026 – 14 Oct 2026" */
/** Out on an exit pass with no return recorded yet: the same QR is scanned again to come back. */
function isOutOnPass(p: any): boolean {
  return p?.status === "EXITED" && p?.type !== "ENTRY" && !(p?.movements ?? []).some((m: any) => m.type === "ENTRY");
}

function passDates(p: { exitDate?: string | Date | null; endDate?: string | Date | null }): string {
  if (!p.exitDate) return "—";
  const start = formatDate(p.exitDate);
  const end = p.endDate ? formatDate(p.endDate) : start;
  return end === start ? start : `${start} – ${end}`;
}

type FacultyApproverOptions = {
  canChoose: boolean;
  hod: { id: string; name: string } | null;
  dean: { id: string; name: string } | null;
};

/**
 * Faculty choose who approves their pass: their department HOD, the Dean, or
 * Both (both must approve). An HOD's own pass always goes to the Dean.
 */
function ApproverChoice({ options }: { options: FacultyApproverOptions | undefined }) {
  const choices = options?.canChoose
    ? [
        { value: "HOD", label: "HOD", detail: options.hod?.name ?? "Not available", available: !!options.hod },
        { value: "DEAN", label: "Dean", detail: options.dean?.name ?? "Not available", available: !!options.dean },
        {
          value: "BOTH",
          label: "Both HOD & Dean",
          detail: "Both must approve",
          available: !!options.hod && !!options.dean,
        },
      ]
    : [];
  const firstAvailable = choices.find((c) => c.available)?.value ?? "";
  const [choice, setChoice] = useState<string>(firstAvailable);

  useEffect(() => {
    if (!choices.some((c) => c.value === choice && c.available)) setChoice(firstAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstAvailable]);

  if (!options) return null;

  if (!options.canChoose) {
    return (
      <div>
        <p className="block text-sm font-medium text-zinc-300 mb-2">Approver</p>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{options.dean?.name ?? "No Dean available"}</span>
          <span className="shrink-0 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">Dean</span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">An HOD&apos;s own pass is approved by the Dean.</p>
      </div>
    );
  }

  return (
    <fieldset className="min-w-0">
      <legend className="block text-sm font-medium text-zinc-300 mb-2">Request approval from *</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {choices.map((c) => (
          <label
            key={c.value}
            className={`flex min-h-14 min-w-0 flex-col justify-center gap-0.5 rounded-2xl border px-4 py-3 transition-colors ${
              !c.available
                ? "border-zinc-800 bg-zinc-950 opacity-50 cursor-not-allowed"
                : choice === c.value
                ? "border-orange-500/60 bg-orange-500/10 cursor-pointer"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-950 cursor-pointer"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <input
                type="radio"
                name="approverChoice"
                value={c.value}
                checked={choice === c.value}
                disabled={!c.available}
                onChange={() => setChoice(c.value)}
                required
                className="h-4 w-4 shrink-0 accent-orange-500"
              />
              <span className="text-sm font-medium text-zinc-100">{c.label}</span>
            </span>
            <span className="truncate pl-[26px] text-xs text-zinc-500">{c.detail}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {choice === "BOTH"
          ? "Your pass is issued only after both the HOD and the Dean approve. If either rejects, the request is rejected."
          : "Only the selected approver needs to approve your pass."}
      </p>
      {!firstAvailable && (
        <p className="mt-2 text-xs text-red-400">No HOD or Dean is available. Contact the administrator.</p>
      )}
    </fieldset>
  );
}

export function FacultyApplyClient() {
  const router = useRouter();
  const isReady = useStoreReady();
  const myPasses = useAppStore((s) => s.data.myPasses);
  // Out on an exit pass with no return yet (the same QR is shown again for the return scan)
  const outOnPass = ((myPasses as any[] | undefined) || []).find((p: any) => isOutOnPass(p)) ?? null;
  const approverOptions = useAppStore((s) => s.data.approverOptions) as FacultyApproverOptions | undefined;

  const [activeTab, setActiveTab] = useState<TabState>("APPLY");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const [type, setType] = useState<"EXIT" | "ENTRY">("EXIT");

  // History Tab States
  const [historyDate, setHistoryDate] = useState<string>("");
  const [historyStatus, setHistoryStatus] = useState<"ALL" | "APPROVED" | "PENDING" | "REJECTED">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // QR Modal States
  const [selectedQrPass, setSelectedQrPass] = useState<any | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  // Auto-poll when there is a pending pass
  const hasPending = (myPasses || []).some((p: any) => p.status === "PENDING");
  useEffect(() => {
    if (!hasPending) return;
    // Every 15 s while the screen is visible (returning to the tab refreshes at once)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") useAppStore.getState().refresh();
    }, 15_000);
    return () => clearInterval(interval);
  }, [hasPending]);

  // Rotating QR while the modal is open: a fresh 60-second signed token every 45 seconds
  const [qrError, setQrError] = useState<string | null>(null);
  const selectedQrPassId: string | null = selectedQrPass?.id ?? null;
  useEffect(() => {
    if (!selectedQrPassId) {
      setQrImage(null);
      setQrError(null);
      return;
    }
    let cancelled = false;
    async function refreshToken() {
      try {
        const res = await generateLiveQrToken(selectedQrPassId!);
        if (cancelled) return;
        if ("error" in res && res.error) {
          setQrError(res.error);
          setQrImage(null);
          return;
        }
        if ("token" in res && res.token) {
          const url = await QRCode.toDataURL(res.token, {
            width: 360, // rendered large: crisp dots scan faster from a screen
            margin: 4, // the standard white border scanners need
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          if (!cancelled) {
            setQrImage(url);
            setQrError(null);
          }
        }
      } catch {
        if (!cancelled) setQrError("Could not refresh the QR code. Check your connection.");
      }
    }
    refreshToken();
    // Only while the QR is on screen (a locked phone / hidden tab makes no
    // requests); coming back refreshes at once so the code shown is current.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshToken();
    }, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshToken();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedQrPassId]);

  // Campus date (IST) — identical on server and client
  const [today, setToday] = useState(() => istDateString());

  useEffect(() => {
    const interval = setInterval(() => setToday(istDateString()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Ensure fresh pass data on mount
  useEffect(() => {
    useAppStore.getState().refresh(true);
  }, []);

  // Faculty Book (Form 1) request fields
  const userName = useAppStore((s) => s.user?.name) ?? "";
  const facultyInfo = useAppStore((s) => (s.data.dashboard as any)?.faculty) as
    | { designation?: string | null; department?: string | null }
    | undefined;
  const [requestType, setRequestType] = useState<string>("ONE_HOUR");
  const [startDate, setStartDate] = useState<string>(() => istDateString());
  const [endDate, setEndDate] = useState<string>("");
  const isMultiDay = requestType === "MULTI_DAY_CL" || requestType === "OD";
  const days = facultyRequestDays(requestType, startDate, isMultiDay ? endDate || startDate : startDate);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    try {
      const result = await createFacultyPermissionRequest(formData, type);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(true);
        // Refresh store immediately so newly created pass is loaded into myPasses
        useAppStore.getState().refresh(true);
        // Reset form state so user can apply again if they leave success screen
        setTimeout(() => {
          setSuccess(false);
          setActiveTab("HISTORY");
        }, 2000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const renderApplyForm = () => {
    if (success) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] px-4">
          <div className="text-center animate-scale-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 mb-5">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 mb-2">
              Request Submitted!
            </h2>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              Your {type.toLowerCase()} request has been sent for approval.
            </p>
          </div>
        </div>
      );
    }

    const activeApprovedPass = (myPasses || []).find(
      (p: any) => p.status === "APPROVED" && p.qr?.active && (!p.qr?.expiresAt || new Date(p.qr.expiresAt) > new Date())
    );
    const pendingPass = (myPasses || []).find((p: any) => p.status === "PENDING");

    // One request at a time: while a pass is pending or approved-but-unused, no new form
    if (pendingPass || activeApprovedPass) {
      const pass = pendingPass ?? activeApprovedPass;
      const waitingFor =
        pass.approvalMode === "BOTH"
          ? [!pass.hodApprovedAt && "HOD", !pass.deanApprovedAt && "Dean"].filter(Boolean).join(" and ")
          : pass.approverType === "DEAN"
          ? "Dean"
          : "HOD";
      return (
        <Card className={pendingPass ? "border-amber-500/25" : "border-emerald-500/25"}>
          <CardContent className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  pendingPass ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {pendingPass ? <Clock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-zinc-100">
                  {pendingPass ? `Request pending — waiting for the ${waitingFor || "approver"}` : `Your ${pass.type} pass is approved`}
                </p>
                <p className="mt-1 text-sm text-zinc-500 leading-relaxed">
                  {pendingPass
                    ? "You can request another pass after this one is approved and used, rejected, or cancelled."
                    : "Show the QR at the gate. You can request another pass after this one is used."}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 rounded-2xl bg-zinc-950 p-4">
              {[
                ["Request Type", facultyRequestTypeLabel(pass.requestType) || pass.type],
                ["Dates", passDates(pass)],
                ["Reason", pass.purpose],
                ["Note", pass.remarks],
                ["Requested", pass.createdAt ? formatDateTime(pass.createdAt) : null],
                ["Approval", pass.approvalMode === "BOTH" ? `HOD ${pass.hodApprovedAt ? "✓" : "…"} • Dean ${pass.deanApprovedAt ? "✓" : "…"}` : waitingFor],
              ].map(([k, v]) => (
                <div key={k as string} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{(v as any) || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col sm:flex-row gap-2.5">
              {activeApprovedPass && !pendingPass && (
                <Button
                  variant="success"
                  onClick={() => setSelectedQrPass(activeApprovedPass)}
                  className="h-12 w-full sm:h-11 sm:w-auto"
                >
                  <QrCode className="h-4 w-4" /> View QR
                </Button>
              )}
              {pendingPass && (
                <Button
                  variant="outline"
                  disabled={cancelling}
                  onClick={async () => {
                    setCancelling(true);
                    setError(null);
                    try {
                      const res: any = await cancelFacultyPermissionRequest(pendingPass.id);
                      if (res?.error) setError(res.error);
                      useAppStore.getState().refresh(true);
                    } catch {
                      setError("Could not cancel the request. Please try again.");
                    }
                    setCancelling(false);
                  }}
                  className="h-12 w-full sm:h-11 sm:w-auto"
                >
                  {cancelling ? "Cancelling…" : "Cancel request"}
                </Button>
              )}
            </div>
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4 sm:space-y-6">
        {activeApprovedPass && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-300">
                  You have an active approved {activeApprovedPass.type} pass!
                </p>
                <p className="text-xs text-zinc-500 break-words">
                  {facultyRequestTypeLabel(activeApprovedPass.requestType) || activeApprovedPass.purpose} • {passDates(activeApprovedPass)}
                </p>
              </div>
            </div>
            <Button
              variant="success"
              onClick={() => setSelectedQrPass(activeApprovedPass)}
              className="h-11 w-full sm:h-10 sm:w-auto shrink-0"
            >
              <QrCode className="h-4 w-4" />
              View QR
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            type="button"
            aria-pressed={type === "EXIT"}
            onClick={() => setType("EXIT")}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition-colors ${
              type === "EXIT"
                ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Exit request</span>
          </button>

          <button
            type="button"
            aria-pressed={type === "ENTRY"}
            onClick={() => setType("ENTRY")}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition-colors ${
              type === "ENTRY"
                ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <LogIn className="h-4 w-4 shrink-0" />
            <span>Entry request</span>
          </button>
        </div>

        <Card>
          <CardContent className="p-5 sm:p-6">
            {error && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade-in">
                {error}
              </div>
            )}

            <form
              // Not a form action: React resets action forms after submit, which would
              // wipe what was typed when the request is refused.
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
              className="space-y-6"
            >
              {/* Faculty details (from the profile) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 rounded-2xl bg-zinc-950 p-4">
                {[
                  { label: "Faculty Name", value: userName },
                  { label: "Designation", value: facultyInfo?.designation },
                  { label: "Department", value: facultyInfo?.department },
                ].map((d, i) => (
                  <div key={d.label} className={`min-w-0 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-200 truncate">{d.value || "—"}</p>
                  </div>
                ))}
              </div>

              {/* Request type */}
              <div>
                <label htmlFor="requestType" className="block text-sm font-medium text-zinc-300 mb-2">Request Type *</label>
                <select
                  id="requestType"
                  name="requestType"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  required
                  className="block h-12 w-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [&>option]:bg-zinc-900"
                >
                  {FACULTY_REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Dates (no time fields) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="min-w-0">
                  <label htmlFor="startDate" className="block text-sm font-medium text-zinc-300 mb-2">Start Date *</label>
                  <DateField
                    id="startDate"
                    name="startDate"
                    value={startDate}
                    min={today}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="block h-12 w-full min-w-0 appearance-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-left text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light]"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="endDate" className="block text-sm font-medium text-zinc-300 mb-2">
                    End Date {isMultiDay ? "*" : ""}
                  </label>
                  <DateField
                    id="endDate"
                    name="endDate"
                    value={isMultiDay ? endDate : startDate}
                    min={startDate || today}
                    onChange={(e) => setEndDate(e.target.value)}
                    readOnly={!isMultiDay}
                    required={isMultiDay}
                    className={`block h-12 w-full min-w-0 appearance-none rounded-2xl border border-zinc-800 px-4 text-left text-base sm:text-sm outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] ${
                      isMultiDay ? "bg-zinc-900 text-zinc-100 hover:border-zinc-700" : "bg-zinc-950 text-zinc-500 cursor-not-allowed"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="block text-sm font-medium text-zinc-300 mb-2">Number of Days</p>
                  <div className="flex h-12 items-center rounded-2xl bg-zinc-950 px-4 text-base sm:text-sm font-medium text-zinc-100">
                    {days === null ? "—" : requestType === "ONE_HOUR" ? "1 hour" : days}
                  </div>
                </div>
              </div>

              {/* Approver choice */}
              <ApproverChoice options={approverOptions} />

              {/* Reason */}
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-zinc-300 mb-2">Reason *</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-4 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <textarea
                    id="reason"
                    name="reason"
                    rows={2}
                    required
                    maxLength={500}
                    placeholder="e.g., Personal work, Official duty at university"
                    className="block min-h-24 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-11 pr-4 py-3.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 resize-none"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label htmlFor="note" className="block text-sm font-medium text-zinc-300 mb-2">Note</label>
                <textarea
                  id="note"
                  name="note"
                  rows={2}
                  maxLength={500}
                  className="block min-h-24 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 resize-none"
                />
              </div>

              <Button
                type="submit"
                className="h-12 w-full text-base"
                size="lg"
                disabled={loading}
              >
                {loading ? "Submitting..." : (
                  <>Submit {type} Request <Send className="h-4 w-4" /></>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

  const matchesPassDate = (p: any, targetDate: string): boolean => {
    if (!targetDate) return true;
    const candidates = [p.exitDate, p.createdAt, p.expectedExit, p.expectedReturn];
    for (const cand of candidates) {
      if (!cand) continue;
      // Compare calendar days in campus time (IST) only — UTC/device dates can be a day off
      const d = new Date(cand);
      if (isNaN(d.getTime())) continue;
      if (istDateString(d) === targetDate) return true;
    }
    return false;
  };

  const renderHistory = () => {
    const rawPasses: any[] = myPasses || [];

    // Filter by date first if selected
    const dateFilteredPasses = historyDate
      ? rawPasses.filter((p) => matchesPassDate(p, historyDate))
      : rawPasses;

    let passesToDisplay: any[] = dateFilteredPasses;

    // Filter by status tab
    if (historyStatus === "APPROVED") {
      passesToDisplay = passesToDisplay.filter((p) =>
        ["APPROVED", "EXITED", "COMPLETED"].includes(p.status)
      );
    } else if (historyStatus === "PENDING") {
      passesToDisplay = passesToDisplay.filter((p) => p.status === "PENDING");
    } else if (historyStatus === "REJECTED") {
      passesToDisplay = passesToDisplay.filter((p) =>
        ["REJECTED", "CANCELLED", "EXPIRED"].includes(p.status)
      );
    }

    const paginated = passesToDisplay.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-4">
          {/* Filter Controls Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 min-w-0">
              {/* Status Tabs */}
              <div className="flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none" role="tablist" aria-label="Filter passes by status">
                {(
                  [
                    { id: "ALL", label: "All Passes" },
                    { id: "APPROVED", label: "Approved" },
                    { id: "PENDING", label: "Pending" },
                    { id: "REJECTED", label: "Rejected / Expired" },
                  ] as const
                ).map((tab) => {
                  const count = dateFilteredPasses.filter((p: any) => {
                    if (tab.id === "APPROVED")
                      return ["APPROVED", "EXITED", "COMPLETED"].includes(p.status);
                    if (tab.id === "PENDING") return p.status === "PENDING";
                    if (tab.id === "REJECTED")
                      return ["REJECTED", "CANCELLED", "EXPIRED"].includes(p.status);
                    return true;
                  }).length;

                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={historyStatus === tab.id}
                      onClick={() => {
                        setHistoryStatus(tab.id);
                        setCurrentPage(1);
                      }}
                      className={`shrink-0 whitespace-nowrap py-1.5 px-3.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        historyStatus === tab.id
                          ? "bg-zinc-900 text-zinc-100 shadow-card"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`min-w-5 text-center text-[10px] px-1.5 py-px rounded-full ${
                          historyStatus === tab.id
                            ? "bg-orange-500/10 text-orange-400"
                            : "bg-zinc-900 text-zinc-500"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Date filter */}
              <div className="flex items-center gap-2">
                <div className="relative flex flex-1 sm:flex-none items-center group">
                  <CalendarIcon className="absolute left-3.5 h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors pointer-events-none z-10" />
                  <DateField
                    value={historyDate}
                    onChange={(e) => {
                      setHistoryDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Filter by date"
                    className="relative h-10 w-full sm:w-44 min-w-0 appearance-none rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-left text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
 showIcon={false}
/>
                </div>

                {historyDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDate("");
                      setCurrentPage(1);
                    }}
                    className="h-10 shrink-0 px-3.5 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-950 hover:border-zinc-700 text-zinc-500 hover:text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    title="Clear date filter"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              {passesToDisplay.length} request{passesToDisplay.length !== 1 ? "s" : ""} found
            </div>
          </div>

          {passesToDisplay.length === 0 ? (
            <Card>
              <EmptyState
                icon={<History className="h-6 w-6 text-zinc-500" />}
                title="No History"
                description={
                  historyDate
                    ? "No passes found for this date."
                    : historyStatus !== "ALL"
                    ? `No ${historyStatus.toLowerCase()} passes found.`
                    : "You haven't requested any passes yet."
                }
              />
            </Card>
          ) : (
            <Card>
              <CardContent className="p-2 sm:p-3">
                <ul className="divide-y divide-zinc-800/70">
                  {paginated.map((pass: any) => (
                    <li key={pass.id} className="px-3 py-4 sm:px-4">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-6">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                              pass.type === "EXIT" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                            }`}>
                              {pass.type === "EXIT" ? <LogOut className="h-3 w-3" /> : <LogIn className="h-3 w-3" />}
                              {pass.type}
                            </span>
                            <StatusBadge status={pass.status} />
                          </div>
                          <p className="text-sm font-medium text-zinc-100 break-words">{pass.purpose}</p>
                          <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {pass.requestType ? (
                              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {facultyRequestTypeLabel(pass.requestType)}</span>
                            ) : pass.destination ? (
                              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {pass.destination}</span>
                            ) : null}
                            <span className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> {passDates(pass)}</span>
                          </div>
                          {pass.status === "PENDING" && pass.approvalMode === "BOTH" && (
                            <p className="text-[11px] text-zinc-500">
                              HOD {pass.hodApprovedAt ? "✓ approved" : "· waiting"} &nbsp;|&nbsp; Dean{" "}
                              {pass.deanApprovedAt ? "✓ approved" : "· waiting"}
                            </p>
                          )}
                          {pass.rejectionReason && (
                            <p className="text-xs text-red-400 break-words">
                              Reason: {pass.rejectionReason}
                            </p>
                          )}
                          {pass.status === "APPROVED" && pass.qr?.active && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => setSelectedQrPass(pass)}
                              className="mt-1 h-10 w-full sm:h-9 sm:w-auto"
                            >
                              <QrCode className="h-4 w-4" />
                              View QR Pass
                            </Button>
                          )}
                          {/* Out on this pass: the same QR is scanned again at the gate for the return */}
                          {isOutOnPass(pass) && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedQrPass(pass)}
                              className="mt-1 h-10 w-full sm:h-9 sm:w-auto"
                            >
                              <QrCode className="h-4 w-4" />
                              Show return QR
                            </Button>
                          )}
                        </div>

                        {/* Movement Logs for this pass */}
                        {pass.movements && pass.movements.length > 0 && (
                          <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-950 px-3.5 py-3 md:min-w-[170px] shrink-0">
                            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Gate Logs</span>
                            {pass.movements.map((m: any) => (
                              <div key={m.id} className="text-xs text-zinc-500 flex items-center gap-1.5 min-w-0">
                                {m.type === "EXIT" ? <LogOut className="h-3 w-3 shrink-0 text-blue-400" /> : <LogIn className="h-3 w-3 shrink-0 text-emerald-400" />}
                                <span className="font-medium text-zinc-300">{formatDateTime(m.createdAt).split(", ")[1]}</span>
                                <span className="truncate">({m.gate?.name})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination (docked at the bottom of the screen while this tab is shown) */}
        <PagerBar
          page={currentPage}
          pageSize={ITEMS_PER_PAGE}
          total={passesToDisplay.length}
          onPageChange={setCurrentPage}
          itemLabel="requests"
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
            My Passes
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Apply for a pass and see today&apos;s passes. Past passes are in the Activity tab.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex w-full sm:w-auto shrink-0 rounded-full bg-zinc-950 p-1 border border-zinc-800" role="tablist" aria-label="My passes">
          {(["APPLY", "HISTORY"] as TabState[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 sm:flex-none h-9 whitespace-nowrap px-4 text-sm font-medium rounded-full transition-colors ${
                activeTab === tab
                  ? "bg-zinc-900 text-zinc-100 shadow-card"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {tab === "APPLY" ? "Apply" : "Today's Passes"}
            </button>
          ))}
        </div>
      </div>

      {!isReady ? (
        <div className="animate-pulse space-y-4">
          <div className="h-14 rounded-2xl bg-zinc-900 border border-zinc-800" />
          <div className="h-80 rounded-3xl bg-zinc-900 border border-zinc-800" />
        </div>
      ) : (
        <div>
          {activeTab === "APPLY" && outOnPass && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-3xl border border-orange-500/20 bg-orange-500/10 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">You&apos;re out on a pass</p>
                <p className="mt-0.5 text-sm text-zinc-400">When you come back, show the same QR at the gate so security records your return.</p>
              </div>
              <Button onClick={() => setSelectedQrPass(outOnPass)} className="w-full sm:w-auto">
                <QrCode className="h-4 w-4" />
                Show return QR
              </Button>
            </div>
          )}
          {activeTab === "APPLY" && renderApplyForm()}
          {activeTab === "HISTORY" && renderHistory()}
        </div>
      )}

      {/* QR Code Modal for Approved Pass */}
      <Modal
        open={!!selectedQrPass}
        onClose={() => setSelectedQrPass(null)}
        title="Gate Pass QR Code"
      >
        {selectedQrPass && (
          <div className="flex flex-col items-center text-center space-y-5 py-2">
            {qrError ? (
              <div className="w-60 h-60 max-w-full flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
                <p className="text-sm text-zinc-300">{qrError}</p>
              </div>
            ) : qrImage ? (
              <div className="bg-white p-3 rounded-3xl border border-zinc-800 shadow-card">
                <img src={qrImage} alt="Gate Pass QR Code" className="w-60 h-60 max-w-full" />
              </div>
            ) : (
              <div className="w-60 h-60 max-w-full flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-3xl">
                <QrCode className="h-12 w-12 text-zinc-500 animate-pulse" />
              </div>
            )}
            <div className="space-y-2 min-w-0">
              {isOutOnPass(selectedQrPass) ? (
                <span className="inline-block text-[11px] px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  Return • show at the gate
                </span>
              ) : (
                <span className="inline-block text-[11px] px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {selectedQrPass.type} PASS • APPROVED
                </span>
              )}
              <h4 className="font-medium text-zinc-100 text-base break-words">{selectedQrPass.purpose}</h4>
              <p className="text-xs text-zinc-500">
                {facultyRequestTypeLabel(selectedQrPass.requestType) || `Destination: ${selectedQrPass.destination || "—"}`} • {passDates(selectedQrPass)}
              </p>
              {selectedQrPass.qr?.expiresAt && !isOutOnPass(selectedQrPass) && (
                <p className="text-xs font-medium text-amber-400">
                  Valid Until: {formatDateTime(selectedQrPass.qr.expiresAt)}
                </p>
              )}
            </div>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              {isOutOnPass(selectedQrPass)
                ? "You're out on this pass. Show this QR to security when you come back; they scan it to record your return."
                : selectedQrPass.type === "ENTRY"
                ? "Present this QR code to campus security at the gate. Valid for one entry."
                : "Present this QR code to campus security at the gate. They scan it when you leave, and again when you come back."}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
