"use client";

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
import { formatDateTime, formatDate } from "@/lib/utils";
import { useStoreReady } from "@/components/providers/store-hydrator";
import QRCode from "qrcode";

type TabState = "APPLY" | "HISTORY";

/** "12 Oct 2026" or "12 Oct 2026 – 14 Oct 2026" */
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
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-zinc-100">{options.dean?.name ?? "No Dean available"}</span>
          <span className="text-xs font-medium text-orange-400">Dean</span>
        </div>
        <p className="text-xs text-zinc-500 mt-1.5">An HOD&apos;s own pass is approved by the Dean.</p>
      </div>
    );
  }

  return (
    <fieldset>
      <legend className="block text-sm font-medium text-zinc-300 mb-2">Request approval from *</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {choices.map((c) => (
          <label
            key={c.value}
            className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors ${
              !c.available
                ? "border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed"
                : choice === c.value
                ? "border-orange-500 bg-orange-500/10 cursor-pointer"
                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800/60 cursor-pointer"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="approverChoice"
                value={c.value}
                checked={choice === c.value}
                disabled={!c.available}
                onChange={() => setChoice(c.value)}
                required
                className="accent-orange-500"
              />
              <span className="text-sm font-semibold text-zinc-100">{c.label}</span>
            </span>
            <span className="text-xs text-zinc-400 pl-5 truncate">{c.detail}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-1.5">
        {choice === "BOTH"
          ? "Your pass is issued only after both the HOD and the Dean approve. If either rejects, the request is rejected."
          : "Only the selected approver needs to approve your pass."}
      </p>
      {!firstAvailable && (
        <p className="text-xs text-red-400 mt-1.5">No HOD or Dean is available. Contact the administrator.</p>
      )}
    </fieldset>
  );
}

export function FacultyApplyClient() {
  const router = useRouter();
  const isReady = useStoreReady();
  const myPasses = useAppStore((s) => s.data.myPasses);
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
    const interval = setInterval(() => {
      useAppStore.getState().refresh(true);
    }, 10000);
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
    const interval = setInterval(refreshToken, 45_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center animate-scale-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">
              Request Submitted!
            </h2>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
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
        <Card className={pendingPass ? "border-amber-500/30" : "border-emerald-500/30"}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {pendingPass ? (
                <Clock className="h-6 w-6 text-amber-400 shrink-0" />
              ) : (
                <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
              )}
              <div>
                <p className={`text-base font-semibold ${pendingPass ? "text-amber-300" : "text-emerald-300"}`}>
                  {pendingPass ? `Request pending — waiting for the ${waitingFor || "approver"}` : `Your ${pass.type} pass is approved`}
                </p>
                <p className="text-xs text-zinc-400">
                  {pendingPass
                    ? "You can request another pass after this one is approved and used, rejected, or cancelled."
                    : "Show the QR at the gate. You can request another pass after this one is used."}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
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
                  <dd className="text-zinc-200 break-words">{(v as any) || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {activeApprovedPass && !pendingPass && (
                <Button
                  onClick={() => setSelectedQrPass(activeApprovedPass)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
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
                  className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  {cancelling ? "Cancelling…" : "Cancel request"}
                </Button>
              )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {activeApprovedPass && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  You have an active approved {activeApprovedPass.type} pass!
                </p>
                <p className="text-xs text-zinc-400">
                  {facultyRequestTypeLabel(activeApprovedPass.requestType) || activeApprovedPass.purpose} • {passDates(activeApprovedPass)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setSelectedQrPass(activeApprovedPass)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-3 shadow-none flex items-center gap-1.5 shrink-0"
            >
              <QrCode className="h-3.5 w-3.5" />
              View QR
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={() => setType("EXIT")}
            className={`flex-1 rounded-xl border-2 px-6 py-4 transition-colors ${type === "EXIT" ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800/50"}`}
          >
            <div className={`flex items-center justify-center gap-2 ${type === "EXIT" ? "text-orange-400" : "text-zinc-400"}`}>
              <MapPin className="h-5 w-5" />
              <span className="font-semibold">EXIT Request</span>
            </div>
          </button>
          
          <button 
            onClick={() => setType("ENTRY")}
            className={`flex-1 rounded-xl border-2 px-6 py-4 transition-colors ${type === "ENTRY" ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800/50"}`}
          >
            <div className={`flex items-center justify-center gap-2 ${type === "ENTRY" ? "text-orange-400" : "text-zinc-400"}`}>
              <MapPin className="h-5 w-5" />
              <span className="font-semibold">ENTRY Request</span>
            </div>
          </button>
        </div>

        <Card>
          <CardContent className="p-6">
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-fade-in">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                {[
                  { label: "Faculty Name", value: userName },
                  { label: "Designation", value: facultyInfo?.designation },
                  { label: "Department", value: facultyInfo?.department },
                ].map((d) => (
                  <div key={d.label} className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">{d.label}</p>
                    <p className="text-sm font-medium text-zinc-200 truncate">{d.value || "—"}</p>
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
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 [&>option]:bg-zinc-900"
                >
                  {FACULTY_REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Dates (no time fields) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-zinc-300 mb-2">Start Date *</label>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    value={startDate}
                    min={today}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-zinc-300 mb-2">
                    End Date {isMultiDay ? "*" : ""}
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    value={isMultiDay ? endDate : startDate}
                    min={startDate || today}
                    onChange={(e) => setEndDate(e.target.value)}
                    readOnly={!isMultiDay}
                    required={isMultiDay}
                    className={`w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark] ${isMultiDay ? "" : "opacity-60 cursor-not-allowed"}`}
                  />
                </div>
                <div>
                  <p className="block text-sm font-medium text-zinc-300 mb-2">Number of Days</p>
                  <div className="px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100">
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
                  <FileText className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <textarea
                    id="reason"
                    name="reason"
                    rows={2}
                    required
                    maxLength={500}
                    placeholder="e.g., Personal work, Official duty at university"
                    className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
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
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold"
                size="lg"
                disabled={loading}
              >
                {loading ? "Submitting..." : (
                  <>Submit {type} Request <Send className="h-4 w-4 ml-2" /></>
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

    const totalPages = Math.max(1, Math.ceil(passesToDisplay.length / ITEMS_PER_PAGE));
    const paginated = passesToDisplay.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );

    return (
      <div className="min-h-[calc(100vh-15rem)] flex flex-col justify-between">
        <div className="space-y-6 flex-1">
          {/* Filter Controls Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Tabs */}
              <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800">
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
                      onClick={() => {
                        setHistoryStatus(tab.id);
                        setCurrentPage(1);
                      }}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        historyStatus === tab.id
                          ? "bg-zinc-800 text-zinc-100 shadow-none"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          historyStatus === tab.id
                            ? "bg-zinc-700 text-zinc-200"
                            : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Redesigned Date Filter Input */}
              <div className="flex items-center gap-2">
                <div className="relative flex items-center group">
                  <CalendarIcon className="absolute left-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-200 transition-colors pointer-events-none z-10" />
                  <input
                    type="date"
                    value={historyDate}
                    onChange={(e) => {
                      setHistoryDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="relative h-9 pl-9 pr-3 w-40 sm:w-44 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-medium rounded-xl focus:outline-none focus:border-zinc-700 [color-scheme:dark] cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/80 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>

                {historyDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDate("");
                      setCurrentPage(1);
                    }}
                    className="h-9 px-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1 transition-colors shadow-none"
                    title="Clear date filter"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-zinc-400 font-medium">
              {passesToDisplay.length} request{passesToDisplay.length !== 1 ? "s" : ""} found
            </div>
          </div>

          {passesToDisplay.length === 0 ? (
            <EmptyState
              icon={<History className="h-10 w-10 text-zinc-500" />}
              title="No History"
              description={
                historyDate
                  ? "No passes found for this date."
                  : historyStatus !== "ALL"
                  ? `No ${historyStatus.toLowerCase()} passes found.`
                  : "You haven't requested any passes yet."
              }
            />
          ) : (
            <div className="space-y-3">
              {paginated.map((pass: any) => (
                <Card key={pass.id} className="overflow-hidden border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors shadow-none rounded-xl">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                            pass.type === "EXIT" ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"
                          }`}>
                            {pass.type}
                          </span>
                          <span className="font-semibold text-zinc-100">{pass.purpose}</span>
                          <StatusBadge status={pass.status} />
                          {pass.status === "PENDING" && pass.approvalMode === "BOTH" && (
                            <span className="text-[11px] text-zinc-400">
                              HOD {pass.hodApprovedAt ? "✓ approved" : "· waiting"} &nbsp;|&nbsp; Dean{" "}
                              {pass.deanApprovedAt ? "✓ approved" : "· waiting"}
                            </span>
                          )}
                          {pass.status === "APPROVED" && pass.qr?.active && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedQrPass(pass)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] h-6 px-2.5 rounded-md font-semibold shadow-none flex items-center gap-1 ml-auto shrink-0"
                            >
                              <QrCode className="h-3 w-3" />
                              View QR Pass
                            </Button>
                          )}
                        </div>
                        <div className="text-sm text-zinc-400 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          {pass.requestType ? (
                            <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {facultyRequestTypeLabel(pass.requestType)}</span>
                          ) : pass.destination ? (
                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {pass.destination}</span>
                          ) : null}
                          <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> {passDates(pass)}</span>
                        </div>
                        {pass.rejectionReason && (
                          <p className="text-xs text-red-400 mt-2">
                            Reason: {pass.rejectionReason}
                          </p>
                        )}
                      </div>
                      
                      {/* Movement Logs for this pass */}
                      {pass.movements && pass.movements.length > 0 && (
                        <div className="flex flex-col gap-1 md:text-right border-t border-zinc-800 md:border-t-0 md:border-l md:pl-4 pt-3 md:pt-0 shrink-0 min-w-[140px]">
                          <span className="text-xs font-semibold text-zinc-500 mb-1 uppercase tracking-wider md:text-right">Gate Logs</span>
                          {pass.movements.map((m: any) => (
                            <div key={m.id} className="text-xs text-zinc-400 flex items-center md:justify-end gap-1.5">
                              {m.type === "EXIT" ? <LogOut className="h-3 w-3 text-orange-500" /> : <LogIn className="h-3 w-3 text-emerald-500" />}
                              <span className="font-medium text-zinc-300">{formatDateTime(m.createdAt).split(", ")[1]}</span>
                              <span>({m.gate?.name})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Pagination Bar (Sticky at bottom, touches sidebar seamlessly with 0px gap) */}
        {passesToDisplay.length > 0 && (
          <div className="sticky bottom-0 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 mt-10 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl z-30 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-zinc-400 font-medium">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, passesToDisplay.length)} of{" "}
                {passesToDisplay.length} requests
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="h-8 px-3 text-xs shadow-none border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    className="h-8 px-3 text-xs shadow-none border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          My Passes
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Apply for a pass and see today&apos;s passes. Past passes are in the Activity tab.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-900/50 p-1 rounded-xl w-full border border-zinc-800/50 max-w-xs">
        {(["APPLY", "HISTORY"] as TabState[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${
              activeTab === tab 
                ? "bg-zinc-800 text-zinc-100 shadow-md" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            {tab === "APPLY" ? "Apply" : "Today's Passes"}
          </button>
        ))}
      </div>

      {!isReady ? (
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-zinc-900/50 rounded-xl" />
        </div>
      ) : (
        <div className="mt-4">
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
          <div className="flex flex-col items-center text-center space-y-4 py-2">
            {qrError ? (
              <div className="w-56 h-56 flex items-center justify-center bg-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-zinc-300">{qrError}</p>
              </div>
            ) : qrImage ? (
              <div className="bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm">
                <img src={qrImage} alt="Gate Pass QR Code" className="w-56 h-56" />
              </div>
            ) : (
              <div className="w-56 h-56 flex items-center justify-center bg-zinc-800 rounded-2xl">
                <QrCode className="h-12 w-12 text-zinc-500 animate-pulse" />
              </div>
            )}
            <div className="space-y-1.5">
              <span className="inline-block text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {selectedQrPass.type} PASS • APPROVED
              </span>
              <h4 className="font-semibold text-zinc-100 text-base">{selectedQrPass.purpose}</h4>
              <p className="text-xs text-zinc-400">
                {facultyRequestTypeLabel(selectedQrPass.requestType) || `Destination: ${selectedQrPass.destination || "—"}`} • {passDates(selectedQrPass)}
              </p>
              {selectedQrPass.qr?.expiresAt && (
                <p className="text-xs text-amber-400 font-mono">
                  Valid Until: {formatDateTime(selectedQrPass.qr.expiresAt)}
                </p>
              )}
            </div>
            <p className="text-xs text-zinc-500 max-w-xs">
              Present this QR code to campus security at the gate. Valid for one movement.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
