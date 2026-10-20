"use client";

import { usePassWatch } from "@/hooks/use-pass-watch";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Select, StatusBadge } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { logoutAction } from "@/server/actions/auth";
import {
  createPermissionRequest,
  createEntryRequest,
  createHostelVisitRequest,
  cancelPermissionRequest,
  generateLiveQrToken,
} from "@/server/actions/permissions";
import { formatDateTime } from "@/lib/utils";
import { istDateString } from "@/lib/time/ist";
import { normalizeTime } from "@/lib/time/parse-time";
import { TimeField } from "@/components/ui/time-field";
import { AssignedApproverCard, type AssignedApprover } from "@/components/student/assigned-approver";
import QRCode from "qrcode";

/** Phone: 10–15 digits, optional +, spaces or dashes (same rule as the server). */
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
/** Keeps only characters that can appear in a phone number. */
/** Which way a pass goes, in plain words (students mix up "exit" and "entry"). */
/** Last expired pass whose "pass expired" note the student has already seen */
const EXPIRY_ALERT_SEEN_KEY = "gatepass_expired_alert_seen";

function passDirection(p: { type?: string; passKind?: string | null }): string {
  if (p?.passKind === "HOSTEL") return "college → hostel";
  return p?.type === "ENTRY" ? "coming into campus" : "going out of campus";
}

export function phoneOnly(value: string): string {
  return value.replace(/[^0-9+\s-]/g, "");
}
import Link from "next/link";
import {
  Clock,
  QrCode,
  MapPin,
  LogIn,
  LogOut,
  BedDouble,
  Calendar,
  Phone,
  FileText,
  Send,
  ShieldCheck,
  AlertCircle,
  XCircle,
  CheckCircle2,
  Hourglass,
  Sparkles,
  X,
  Home,
} from "lucide-react";
import { useAppStore, logoutAndClear } from "@/stores/app-store";
import { SigningOutOverlay } from "@/components/ui/signing-out-overlay";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function StudentDashboardClient({ user }: Props) {
  const router = useRouter();
  const [isPendingTransition, startTransition] = useTransition();

  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);

  const state = dashboardData?.state;

  // Waiting on someone else — the approver (PENDING) or the gate scan (QR_CODE):
  // the screen reloads the moment the pass changes (live ping, or a tiny status
  // check while there is no live connection), e.g. straight to the
  // confirmation after the guard scans.
  const waiting = state === "PENDING" || state === "QR_CODE";
  usePassWatch(dashboardData?.latestPermission?.id, waiting, () => {
    startTransition(() => {
      useAppStore.getState().refresh(true);
    });
  });

  // A rejection is shown once; after the student dismisses it (button/timer) we go back to the form.
  const latestId: string | undefined = dashboardData?.latestPermission?.id;
  const [dismissedRejectionId, setDismissedRejectionId] = useState<string | null>(null);
  useEffect(() => {
    if (state !== "REJECTED" || !latestId) return;
    try {
      if (sessionStorage.getItem(REJECTION_ACK_KEY) === latestId) setDismissedRejectionId(latestId);
    } catch {}
  }, [state, latestId]);

  const dismissRejection = () => {
    if (!latestId) return;
    try {
      sessionStorage.setItem(REJECTION_ACK_KEY, latestId);
    } catch {}
    setDismissedRejectionId(latestId);
  };

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  // If no dashboard data or student record
  if (!dashboardData || !dashboardData.student) {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-full max-w-md text-center p-6 sm:p-8 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-card">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
              <AlertCircle className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-medium text-zinc-100 mb-1">Student Record Not Found</h2>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6">
              Please contact the campus administrator to initialize your student profile.
            </p>
            <RecordMissingSignOut />
          </div>
        </div>
      
    );
  }

  const { student, isHosteller, assignedApprover, latestPermission, hostelPassApprover } = dashboardData;
  const showRejected = state === "REJECTED" && latestPermission && dismissedRejectionId !== latestPermission.id;
  const showForm = state === "FORM" || (state === "REJECTED" && !showRejected);

  return (
    <>
      <div className="mx-auto w-full max-w-2xl py-1 sm:py-2">
        {showRejected && (
          <RejectedView permission={latestPermission} onDone={dismissRejection} />
        )}

        {state === "QR_CODE" && latestPermission && (
          <QrCodeView
            user={user}
            student={student}
            permission={latestPermission}
          />
        )}

        {state === "PENDING" && latestPermission && (
          <PendingApprovalView
            student={student}
            permission={latestPermission}
            isHosteller={isHosteller}
          />
        )}

        {showForm && (
          <PermissionFormView
            student={student}
            assignedApprover={assignedApprover}
            hostelPassApprover={hostelPassApprover}
            isHosteller={isHosteller}
            latestPermission={latestPermission}
          />
        )}
      </div>
    
    </>
  );
}

function RecordMissingSignOut() {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <>
      <Button
        onClick={async () => {
          setSigningOut(true);
          try {
            await logoutAndClear(logoutAction);
          } catch (err: any) {
            if (!String(err?.digest ?? err?.message ?? "").includes("NEXT_REDIRECT")) setSigningOut(false);
          }
        }}
        variant="outline"
        loading={signingOut}
        disabled={signingOut}
        className="w-full sm:w-auto"
      >
        {signingOut ? "Signing out…" : "Sign Out"}
      </Button>
      {signingOut && <SigningOutOverlay />}
    </>
  );
}

/** Matches the TimeField (shared, not editable here) to the h-12 rounded-2xl white inputs. */
const TIME_FIELD_CLS = "h-12! rounded-2xl! bg-zinc-900! text-base! sm:text-sm! hover:border-zinc-700 focus:border-orange-500/50!";

const REJECTION_ACK_KEY = "gatepass:rejection-ack";
const REJECTED_AUTO_RETURN_S = 20;

// ──────────────────────────────────────────────────────────────
// VIEW 0: REJECTED (reason from HOD / warden, then back to the form)
// ──────────────────────────────────────────────────────────────

function RejectedView({ permission, onDone }: { permission: any; onDone: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(REJECTED_AUTO_RETURN_S);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, onDone]);

  const approverRole =
    permission.approverType === "WARDEN" ? "Hostel Warden" : permission.approverType === "FACULTY_ADMIN" ? "HOD" : "approver";

  return (
    <div className="space-y-5 sm:space-y-6 animate-scale-in" role="alert">
      <div className="text-center px-2">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <XCircle className="h-7 w-7" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
          Request rejected: {passDirection(permission)}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
          Your request was rejected by your {approverRole}
          {permission.approverName ? ` (${permission.approverName})` : ""}.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <span className="text-[11px] font-medium text-red-400 uppercase tracking-wider block mb-1.5">Reason</span>
            <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap break-words">
              {permission.rejectionReason || "No reason was provided."}
            </p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Purpose</dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">{permission.purpose}</dd>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{permission.type === "ENTRY" ? "Coming From" : "Destination"}</dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">{permission.destination || "—"}</dd>
            </div>
          </dl>
          <Button type="button" onClick={onDone} className="w-full h-12">
            Submit a new request
          </Button>
          <p className="text-center text-xs text-zinc-500" aria-live="polite">
            Returning to the request form in {secondsLeft}s
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// VIEW 1: QR CODE DISPLAY (Valid Approved Request Only)
// ──────────────────────────────────────────────────────────────

function QrCodeView({
  user,
  student,
  permission,
}: {
  user: { name: string; email: string };
  student: any;
  permission: any;
}) {
  // Hostel pass: HOD-approved, scanned by the hostel warden (not gate security)
  const isHostelPass = permission?.passKind === "HOSTEL";
  // Hosteller out on this pass: the same QR is scanned again when they come back
  const isReturning = permission?.status === "EXITED" && permission?.type !== "ENTRY" && !isHostelPass;
  const isHostellerStudent = student?.studentType === "HOSTELLER";
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  // Rotating QR: a fresh 60-second signed token every 45 seconds, so a
  // screenshot of this screen stops working almost immediately.
  useEffect(() => {
    let cancelled = false;

    async function refreshToken() {
      try {
        const res = await generateLiveQrToken(permission.id);
        if (cancelled) return;
        if ("error" in res && res.error) {
          setQrError(res.error);
          setQrImage(null);
          // Pass was just scanned/used or expired → reload state (shows the confirmation / form)
          useAppStore.getState().refresh(true);
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
        if (!cancelled) setQrError("Could not refresh your QR code. Check your connection.");
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
  }, [permission.id]);

  // Realtime countdown timer
  useEffect(() => {
    if (!permission.qr?.expiresAt || permission.status === "EXITED") {
      setTimeLeft(permission.status === "EXITED" ? "Valid for Return" : "");
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(permission.qr.expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s remaining`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s remaining`);
      } else {
        setTimeLeft(`${seconds}s remaining`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [permission.qr?.expiresAt, permission.status]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-scale-in">
      {/* Header */}
      <div className="text-center px-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
          permission.type === "ENTRY"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-orange-500/10 text-orange-400"
        }`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{isHostelPass ? "Pass: college → hostel" : isReturning ? "Return pass: coming back" : permission.type === "ENTRY" ? "Pass: coming into campus" : "Pass: going out of campus"}</span>
        </span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
          {isHostelPass ? "Show to Your Hostel Warden" : isReturning ? "Scan When You Return" : "Scan at Campus Gate"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 leading-relaxed max-w-md mx-auto">
          {isHostelPass
            ? "Your HOD approved this pass. Show this QR code to your hostel warden when you reach the hostel."
            : isReturning
            ? "You're out on this pass. When you come back, show this same QR code to the gate security officer to record your return."
            : permission.type === "ENTRY"
            ? "Present this QR code to the gate security officer to enter campus."
            : "Present this QR code to the gate security officer to exit campus."}
        </p>
      </div>

      {/* Main QR Card */}
      <Card className="overflow-hidden">
        {/* Countdown header */}
        <div className="border-b border-zinc-800/70 px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isExpired ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              <Clock className={`h-4 w-4 ${isExpired ? "" : "animate-pulse"}`} />
            </span>
            <span className={`text-sm font-medium tabular-nums truncate ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
              {isExpired ? "Pass Expired" : timeLeft || "Calculating validity..."}
            </span>
          </div>
          <StatusBadge status={permission.status} />
        </div>

        <CardContent className="p-5 sm:p-8 flex flex-col items-center text-center space-y-5 sm:space-y-6 min-w-0">
          {/* QR Code Container — always black on white with a quiet zone, so it scans fast */}
          <div className="w-full max-w-[18rem] sm:max-w-[20rem] rounded-3xl border border-zinc-800 bg-white p-2.5 sm:p-3">
            {qrError ? (
              <div className="aspect-square w-full flex items-center justify-center rounded-2xl bg-zinc-950 p-5">
                <p className="text-sm text-zinc-300 font-medium leading-relaxed">{qrError}</p>
              </div>
            ) : qrImage ? (
              <img
                src={qrImage}
                alt="Gate Pass QR Code"
                className="block w-full h-auto aspect-square object-contain [image-rendering:pixelated]"
              />
            ) : (
              <div className="aspect-square w-full flex items-center justify-center rounded-2xl bg-zinc-950">
                <QrCode className="h-12 w-12 sm:h-14 sm:w-14 text-zinc-600 animate-pulse" />
              </div>
            )}
          </div>

          {/* Student & Pass Meta */}
          <dl className="w-full rounded-2xl border border-zinc-800 divide-y divide-zinc-800/70 text-left min-w-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3 min-w-0">
              <dt className="text-xs text-zinc-500 shrink-0">Student</dt>
              <dd className="text-sm font-medium text-zinc-100 truncate min-w-0 text-right">
                {user.name} ({student.studentRoll})
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 min-w-0">
              <dt className="text-xs text-zinc-500 shrink-0">Purpose</dt>
              <dd className="text-sm font-medium text-zinc-100 truncate min-w-0 text-right">
                {permission.purpose}
              </dd>
            </div>
            {permission.destination && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 min-w-0">
                <dt className="text-xs text-zinc-500 shrink-0">Destination</dt>
                <dd className="text-sm font-medium text-zinc-100 truncate min-w-0 text-right">
                  {permission.destination}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3 min-w-0">
              <dt className="text-xs text-zinc-500 shrink-0">Valid Until</dt>
              <dd className="text-sm font-medium text-amber-400 truncate min-w-0 text-right">
                {permission.qr?.expiresAt
                  ? formatDateTime(permission.qr.expiresAt)
                  : "End of allocated slot"}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
            {isHostelPass ? (
              <>This QR code refreshes automatically every minute — screenshots will not work. Once your warden scans it, your arrival at the hostel is recorded and this pass is completed.</>
            ) : (
              <>
                This QR code refreshes automatically every minute — screenshots will not work at the gate.
                {isReturning
                  ? "Once security scans it at the gate, your return is logged and this pass is completed."
                  : permission.type === "ENTRY"
                  ? "Once scanned by security, your entry will be logged and this pass will be completed."
                  : isHostellerStudent
                  ? "Security scans it when you leave, and again when you come back."
                  : "Once scanned by security, your exit will be logged and this pass will be completed."}
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// VIEW 2: PENDING APPROVAL VIEW (Waiting for Faculty / Warden)
// ──────────────────────────────────────────────────────────────

function PendingApprovalView({
  student,
  permission,
  isHosteller,
}: {
  student: any;
  permission: any;
  isHosteller: boolean;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const approverLabel =
    permission.approverType === "WARDEN"
      ? "Hostel Warden"
      : permission.approverType === "FACULTY_ADMIN"
      ? "HOD"
      : isHosteller
      ? "Hostel Warden"
      : "Faculty";

  async function handleCancelConfirm() {
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelPermissionRequest(permission.id);
      if (res?.error) {
        setError(res.error);
        setCancelling(false);
      } else {
        useAppStore.getState().refresh(true);
      }
    } catch {
      setError("Failed to cancel request. Please try again.");
      setCancelling(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        title="Cancel Permission Request"
        description="Are you sure you want to cancel this permission request? This action cannot be undone."
        confirmText="Yes, Cancel Request"
        cancelText="Keep Request"
        onConfirm={handleCancelConfirm}
        variant="danger"
      />
      <div className="space-y-4 sm:space-y-6 animate-scale-in">
      {/* Status (feature card) */}
      <div
        className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
        style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/80 border border-white text-orange-400">
            <Hourglass className="h-6 w-6 animate-spin" style={{ animationDuration: "6s" }} />
          </span>
          <StatusBadge status="PENDING" />
        </div>
        <h1 className="mt-4 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
          Waiting for approval: {passDirection(permission)}
        </h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
          Your request ({passDirection(permission)}) has been sent and is waiting for approval from your{" "}
          <span className="text-zinc-100 font-medium">{approverLabel}</span>
          {permission.approverName ? ` (${permission.approverName})` : ""}.
        </p>

        {/* Live waiting indicator */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 border border-white px-4 py-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed">
            This page automatically refreshes every few seconds. Once approved, your QR pass will appear here instantly.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Details Card */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Request summary
          </h2>

          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Purpose</dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">
                {permission.purpose}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{permission.type === "ENTRY" ? "Coming From" : "Destination"}</dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">
                {permission.destination || "Not specified"}
              </dd>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Date</dt>
              <dd className="text-sm font-medium text-zinc-200">
                {permission.exitDate ? formatDateTime(permission.exitDate).split(",")[0] : "Today"}
              </dd>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-950 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{permission.type === "ENTRY" ? "Expected Entry Time" : "Expected Exit Time"}</dt>
              <dd className="text-sm font-medium text-zinc-200">
                {permission.expectedExit ? formatDateTime(permission.expectedExit).split(", ")[1] : "--:--"}
              </dd>
            </div>
          </dl>

          {permission.remarks && (
            <div className="p-4 rounded-2xl bg-zinc-950">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Remarks</p>
              <p className="text-sm text-zinc-300 break-words">{permission.remarks}</p>
            </div>
          )}

          {/* Cancel button */}
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={cancelling}
              onClick={() => setShowCancelDialog(true)}
              className="w-full h-11 text-zinc-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" />
              {cancelling ? "Cancelling..." : "Cancel This Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// VIEW 3: PERMISSION REQUEST FORM (When no active request or rejected)
// ──────────────────────────────────────────────────────────────

function PermissionFormView({
  student,
  assignedApprover,
  hostelPassApprover,
  isHosteller,
  latestPermission,
}: {
  student: any;
  assignedApprover: AssignedApprover | undefined;
  /** Hostellers going to the hostel: their department HOD */
  hostelPassApprover?: AssignedApprover | null;
  isHosteller: boolean;
  latestPermission: any | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errors shown under the input they belong to
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const showFieldError = (field: string, message: string) => {
    setFieldErrors({ [field]: message });
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[name="${field}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 0);
  };

  const wasExpired =
    latestPermission?.status === "EXPIRED" ||
    (latestPermission?.status === "APPROVED" &&
      latestPermission?.qr &&
      !latestPermission.qr.usedForExit &&
      new Date(latestPermission.qr.expiresAt) <= new Date());

  // The "pass expired" note is shown once per pass: after it is closed (or
  // fades after 8 s) it doesn't come back on the next sign-in.
  const expiredPassId: string | null = wasExpired ? latestPermission.id : null;
  const [expiryAlertId, setExpiryAlertId] = useState<string | null>(null);
  const closeExpiryAlert = () => {
    if (expiredPassId) {
      try {
        localStorage.setItem(EXPIRY_ALERT_SEEN_KEY, expiredPassId);
      } catch {}
    }
    setExpiryAlertId(null);
  };
  useEffect(() => {
    if (!expiredPassId) return;
    let seen = false;
    try {
      seen = localStorage.getItem(EXPIRY_ALERT_SEEN_KEY) === expiredPassId;
    } catch {}
    if (seen) return;
    const show = setTimeout(() => setExpiryAlertId(expiredPassId), 0);
    const hide = setTimeout(() => {
      try {
        localStorage.setItem(EXPIRY_ALERT_SEEN_KEY, expiredPassId);
      } catch {}
      setExpiryAlertId(null);
    }, 8000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [expiredPassId]);
  const showExpiryAlert = !!expiredPassId && expiryAlertId === expiredPassId;

  // Always opens on "Going out"; the student switches if they need another pass
  const [requestType, setRequestType] = useState<"EXIT" | "ENTRY" | "HOSTEL">("EXIT");
  // Hostellers' exit requests are outing passes (date range + parent contact)
  const isOuting = isHosteller && requestType === "EXIT";
  const studentName = useAppStore((s) => s.user?.name) ?? "";
  const [outingFrom, setOutingFrom] = useState(() => istDateString());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);

    // Phone numbers: checked here so the message appears at the field
    for (const field of ["contactNumber", "videoCallNumber"] as const) {
      const v = String(formData.get(field) ?? "").trim();
      if (v && !PHONE_RE.test(v)) {
        showFieldError(field, "Enter a valid phone number (10–15 digits)");
        setLoading(false);
        return;
      }
    }

    // The time picker already gives "HH:mm"; normalize anyway for older browsers
    // that fall back to a plain text box (accepts "11 59 am", "4pm", "16:30", ...).
    for (const field of ["expectedExit", "expectedReturn", "inTime"] as const) {
      const raw = formData.get(field) as string | null;
      if (!raw) continue;
      const normalized = normalizeTime(raw);
      if (!normalized) {
        setError("Please choose a valid time, e.g. 04:30 PM.");
        setLoading(false);
        return;
      }
      formData.set(field, normalized);
    }
    try {
      const result: { error?: string; field?: string; success?: boolean } =
        requestType === "ENTRY"
          ? await createEntryRequest(formData)
          : requestType === "HOSTEL"
          ? await createHostelVisitRequest(formData)
          : await createPermissionRequest(formData);
      if (result?.error) {
        if (result.field && document.querySelector(`[name="${result.field}"]`)) showFieldError(result.field, result.error);
        else setError(result.error);
        setLoading(false);
      } else if (result?.success) {
        useAppStore.getState().refresh(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  // Campus date (IST) — identical on server and client
  const [todayStr, setTodayStr] = useState(() => istDateString());

  useEffect(() => {
    const interval = setInterval(() => setTodayStr(istDateString()), 60000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="space-y-5 sm:space-y-6 animate-scale-in">
      {/* Title: says plainly which way the student is going */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
          {requestType === "ENTRY"
            ? "Come into campus"
            : requestType === "HOSTEL"
            ? "Go to the hostel"
            : "Go out of campus"}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
          {requestType === "ENTRY"
            ? isHosteller
              ? "Only if you have no outing pass."
              : "Show the QR at the gate."
            : requestType === "HOSTEL"
            ? "The warden scans it at the hostel."
            : isHosteller
            ? "Use the same QR to come back."
            : "Show the QR at the gate."}
        </p>
      </div>

      {/* Which way are you going? */}
      <div
        role="radiogroup"
        aria-label="Which way are you going?"
        className={`grid ${isHosteller ? "grid-cols-3" : "grid-cols-2"} gap-1 rounded-[22px] bg-zinc-950 p-1 border border-zinc-800`}
      >
        {(
          [
            {
              type: "EXIT" as const,
              icon: LogOut,
              tone: "text-orange-400",
              title: "Going out",
              hint: "Leave campus",
            },
            {
              type: "ENTRY" as const,
              icon: LogIn,
              tone: "text-emerald-400",
              title: "Coming in",
              hint: "Enter campus",
            },
            ...(isHosteller
              ? [
                  {
                    type: "HOSTEL" as const,
                    icon: BedDouble,
                    tone: "text-sky-400",
                    title: "To hostel",
                    hint: "From college",
                  },
                ]
              : []),
          ]
        ).map((opt) => {
          const selected = requestType === opt.type;
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setRequestType(opt.type);
                if (opt.type === "HOSTEL") setFieldErrors({});
              }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-1.5 sm:px-4 py-2.5 sm:py-3 text-center transition-colors ${
                selected ? "bg-zinc-900 shadow-card text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5 text-[13px] sm:text-sm font-semibold leading-tight">
                <Icon className={`h-4 w-4 shrink-0 ${selected ? opt.tone : ""}`} />
                <span>{opt.title}</span>
              </span>
              <span className="text-[11px] sm:text-xs leading-snug text-zinc-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Expiry Alert Banner */}
      {showExpiryAlert && (
        <div className="relative rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 sm:p-5 animate-fade-in">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={closeExpiryAlert}
            className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 pr-10 text-amber-400 font-medium text-sm">
            <Clock className="h-5 w-5 flex-shrink-0" />
            <span>Gate Pass Expired</span>
          </div>
          <p className="mt-2 text-xs text-zinc-300 pl-7 pr-2 leading-relaxed">
            Your previous approved gate pass for <span className="font-medium text-zinc-100">&ldquo;{latestPermission.purpose}&rdquo;</span> expired because it was not scanned at the gate within the valid time window. You must submit a new request.
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <Card>
        <CardContent className="p-5 sm:p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <input type="hidden" name="type" value={requestType} />
            {/* Purpose */}
            <div className="space-y-2">
              <label htmlFor="purpose" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-500" />
                {requestType === "ENTRY" ? "Purpose of Campus Entry" : requestType === "HOSTEL" ? "Purpose of Going to Hostel" : "Purpose of Exit"} <span className="text-orange-400">*</span>
              </label>

              <Input
                id="purpose"
                name="purpose"
                placeholder={requestType === "ENTRY" ? "e.g. Returning from home, Doctor visit return, Project return..." : "e.g. Doctor's appointment, Home visit, Project work..."}
                required
                error={fieldErrors.purpose}
                className="text-base sm:text-sm"
              />
            </div>

            {/* Destination / Coming From (a hostel pass always goes to the hostel) */}
            {requestType !== "HOSTEL" && (
            <div className="space-y-2">
              <label htmlFor="destination" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-zinc-500" />
                {requestType === "ENTRY" ? "Origin / Coming From Location" : "Destination / Location"} <span className="text-orange-400">*</span>
              </label>
              <Input
                id="destination"
                name="destination"
                placeholder={requestType === "ENTRY" ? "e.g. Home, Hospital, City Center" : "e.g. Apollo Hospital, City Center, Home"}
                required
                error={fieldErrors.destination}
                className="text-base sm:text-sm"
              />
            </div>
            )}

            {/* Approver (assigned automatically — students cannot choose) */}
            <AssignedApproverCard
              approver={requestType === "HOSTEL" ? hostelPassApprover ?? undefined : assignedApprover}
              isHosteller={isHosteller && requestType !== "HOSTEL"}
              accent={requestType === "ENTRY" ? "emerald" : "orange"}
            />

            {isOuting ? (
              <HostelOutingFields
                student={student}
                studentName={studentName}
                todayStr={todayStr}
                outingFrom={outingFrom}
                setOutingFrom={setOutingFrom}
                fieldErrors={fieldErrors}
              />
            ) : (
            /* Timings Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <label htmlFor="exitDate" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-500" />
                  {requestType === "ENTRY" ? "Entry Date" : "Exit Date"} <span className="text-orange-400">*</span>
                </label>
                <DateField id="exitDate" name="exitDate" value={todayStr} readOnly className="h-12 w-full rounded-2xl bg-zinc-950 text-zinc-400" />
              </div>

              <div className="space-y-2">
                <label htmlFor="expectedExit" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-500" />
                  {requestType === "ENTRY" ? "Expected Entry Time" : "Expected Exit Time"} <span className="text-orange-400">*</span>
                </label>
                <TimeField name="expectedExit" required defaultToNow className={TIME_FIELD_CLS} />
                {fieldErrors.expectedExit && <p className="text-xs text-red-400">{fieldErrors.expectedExit}</p>}
              </div>
            </div>
            )}

            {/* Contact Number */}
            <div className="space-y-2">
              <label htmlFor="contactNumber" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Phone className="h-4 w-4 text-zinc-500" />
                Emergency Contact Number
              </label>
              <Input
                id="contactNumber"
                name="contactNumber"
                type="tel"
                inputMode="tel"
                maxLength={15}
                placeholder="+91-9876543210"
                onInput={(e) => {
                  e.currentTarget.value = phoneOnly(e.currentTarget.value);
                }}
                error={fieldErrors.contactNumber}
                className="text-base sm:text-sm"
              />
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <label htmlFor="remarks" className="text-sm font-medium text-zinc-300">
                Additional Remarks <span className="font-normal text-zinc-500">(Optional)</span>
              </label>
              <Textarea
                id="remarks"
                name="remarks"
                placeholder="Any special notes or details..."
                rows={2}
                className="px-4 py-3"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading || !(requestType === "HOSTEL" ? hostelPassApprover?.available : assignedApprover?.available)}
              className="w-full h-12 text-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span>Submitting {requestType === "ENTRY" ? "Entry" : requestType === "HOSTEL" ? "Hostel" : "Exit"} Request...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <span>Submit {requestType} Request</span>
                </div>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Hostel student outing pass (Forms 12/13): student details, outing dates, parent contact. */
function HostelOutingFields({
  student,
  studentName,
  todayStr,
  outingFrom,
  setOutingFrom,
  fieldErrors = {},
}: {
  student: any;
  studentName: string;
  todayStr: string;
  outingFrom: string;
  setOutingFrom: (v: string) => void;
  /** Errors shown under the input they belong to */
  fieldErrors?: Record<string, string>;
}) {
  const maxDate = istDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [outingTo, setOutingTo] = useState(todayStr);
  const [informed, setInformed] = useState<"" | "yes" | "no">("");
  const label = "text-sm font-medium text-zinc-300 flex items-center gap-2";
  const inputCls = "text-base sm:text-sm";

  const details = [
    { k: "Name", v: studentName },
    { k: "Roll Number", v: student?.studentRoll },
    { k: "Branch", v: student?.department },
    {
      k: "Year & Semester",
      v: [student?.year ? `Year ${student.year}` : null, student?.semester ? `Sem ${student.semester}` : null]
        .filter(Boolean)
        .join(" • "),
    },
  ];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 rounded-2xl bg-zinc-950 p-4">
        {details.map((d) => (
          <div key={d.k} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{d.k}</dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-200 truncate">{d.v || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div className="space-y-2">
          <label htmlFor="exitDate" className={label}>
            <Calendar className="h-4 w-4 text-zinc-500" /> Outing Date From <span className="text-orange-400">*</span>
          </label>
          <DateField
            id="exitDate"
            name="exitDate"
            value={outingFrom}
            min={todayStr}
            max={maxDate}
            onChange={(e) => {
              if (!e.target.value) return;
              setOutingFrom(e.target.value);
              if (outingTo < e.target.value) setOutingTo(e.target.value);
            }}
            required
            className="h-12 w-full rounded-2xl"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="outingDateTo" className={label}>
            <Calendar className="h-4 w-4 text-zinc-500" /> Outing Date To <span className="text-orange-400">*</span>
          </label>
          <DateField
            id="outingDateTo"
            name="outingDateTo"
            value={outingTo}
            min={outingFrom}
            onChange={(e) => e.target.value && setOutingTo(e.target.value)}
            required
            className={`h-12 w-full rounded-2xl ${fieldErrors.outingDateTo ? "border-red-500/50" : ""}`}
          />
          {fieldErrors.outingDateTo && <p className="text-xs text-red-400">{fieldErrors.outingDateTo}</p>}
        </div>
        <div className="space-y-2">
          <label htmlFor="expectedExit" className={label}>
            <Clock className="h-4 w-4 text-zinc-500" /> Out Time (on the From date) <span className="text-orange-400">*</span>
          </label>
          <TimeField name="expectedExit" required defaultToNow className={TIME_FIELD_CLS} />
          {fieldErrors.expectedExit && <p className="text-xs text-red-400">{fieldErrors.expectedExit}</p>}
        </div>
        <div className="space-y-2">
          <label htmlFor="inTime" className={label}>
            <Clock className="h-4 w-4 text-zinc-500" /> In Time (on the To date)
          </label>
          <TimeField name="inTime" className={TIME_FIELD_CLS} />
          {fieldErrors.inTime && <p className="text-xs text-red-400">{fieldErrors.inTime}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-300">
          Informed to Parent / Guardian <span className="text-orange-400">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-zinc-950 p-1 border border-zinc-800">
          {(["yes", "no"] as const).map((v) => (
            <label
              key={v}
              className={`flex h-10 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-500/40 ${
                informed === v ? "bg-zinc-900 shadow-card text-orange-400" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <input
                type="radio"
                name="parentInformed"
                value={v}
                checked={informed === v}
                onChange={() => setInformed(v)}
                required
                className="sr-only"
              />
              {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <div className="space-y-2">
          <label htmlFor="guardianName" className={label}>Parent / Guardian Name</label>
          <Input id="guardianName" name="guardianName" maxLength={100} className={inputCls} />
        </div>
        <div className="space-y-2">
          <label htmlFor="guardianRelation" className={label}>Relation with Student</label>
          <Input id="guardianRelation" name="guardianRelation" maxLength={50} placeholder="e.g. Father" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label htmlFor="videoCallNumber" className={label}>
            <Phone className="h-3.5 w-3.5 text-zinc-500" /> Video Call Made to Phone
          </label>
          <Input
            id="videoCallNumber"
            name="videoCallNumber"
            type="tel"
            inputMode="tel"
            maxLength={15}
            placeholder="Phone number"
            onInput={(e) => {
              e.currentTarget.value = phoneOnly(e.currentTarget.value);
            }}
            error={fieldErrors.videoCallNumber}
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="hostelInchargeDetails" className={label}>Hostel In-charge Details</label>
        <Input
          id="hostelInchargeDetails"
          name="hostelInchargeDetails"
          maxLength={200}
          placeholder="Name and contact of the hostel in-charge"
          className={inputCls}
        />
      </div>
    </div>
  );
}
