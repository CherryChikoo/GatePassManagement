"use client";

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
export function phoneOnly(value: string): string {
  return value.replace(/[^0-9+\s-]/g, "");
}
import Link from "next/link";
import {
  Clock,
  QrCode,
  MapPin,
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

  // Poll while waiting on someone else: the approver (PENDING) or the gate scan (QR_CODE)
  useEffect(() => {
    if (state === "PENDING" || state === "QR_CODE") {
      const interval = setInterval(() => {
        startTransition(() => {
          useAppStore.getState().refresh(true);
        });
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [state]);

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
          <div className="text-center p-8 max-w-md rounded-2xl bg-zinc-900/50 border border-zinc-800">
            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-zinc-100 mb-1">Student Record Not Found</h2>
            <p className="text-sm text-zinc-400 mb-6">
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
      <div className="max-w-2xl mx-auto py-2">
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
      >
        {signingOut ? "Signing out…" : "Sign Out"}
      </Button>
      {signingOut && <SigningOutOverlay />}
    </>
  );
}

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
    <div className="space-y-6 animate-scale-in" role="alert">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 mb-2">
          <XCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          {permission.type === "ENTRY" ? "Entry Request Rejected" : "Exit Request Rejected"}
        </h1>
        <p className="text-sm text-zinc-400">
          Your request was rejected by your {approverRole}
          {permission.approverName ? ` (${permission.approverName})` : ""}.
        </p>
      </div>

      <Card className="border-red-500/30 bg-zinc-900/60 shadow-xl">
        <CardContent className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <span className="text-xs font-semibold text-red-300 uppercase tracking-wider block mb-1">Reason</span>
            <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words">
              {permission.rejectionReason || "No reason was provided."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">Purpose</span>
              <span className="text-zinc-200 font-medium text-sm break-words">{permission.purpose}</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">{permission.type === "ENTRY" ? "Coming From" : "Destination"}</span>
              <span className="text-zinc-200 font-medium text-sm break-words">{permission.destination || "—"}</span>
            </div>
          </div>
          <Button type="button" onClick={onDone} className="w-full h-11 bg-orange-600 hover:bg-orange-500 text-white font-semibold">
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
    const interval = setInterval(refreshToken, 45_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
    <div className="space-y-6 animate-scale-in">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2 ${
          permission.type === "ENTRY"
            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
            : "bg-orange-500/15 border border-orange-500/30 text-orange-400"
        }`}>
          <ShieldCheck className="h-4 w-4" />
          <span>{isHostelPass ? "Active HOSTEL Pass" : permission.type === "ENTRY" ? "Active Campus ENTRY Pass" : "Active Campus EXIT Pass"}</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          {isHostelPass ? "Show to Your Hostel Warden" : "Scan at Campus Gate"}
        </h1>
        <p className="text-sm text-zinc-400">
          {isHostelPass
            ? "Your HOD approved this pass. Show this QR code to your hostel warden when you reach the hostel."
            : permission.type === "ENTRY"
            ? "Present this QR code to the gate security officer to enter campus."
            : "Present this QR code to the gate security officer to exit campus."}
        </p>
      </div>

      {/* Main QR Card */}
      <Card className="overflow-hidden border-zinc-800 bg-zinc-900/70 shadow-2xl">
        {/* Countdown header */}
        <div className="bg-gradient-to-r from-emerald-600/20 via-blue-600/20 to-teal-600/20 border-b border-zinc-800/80 px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-emerald-400 truncate">
              {isExpired ? "Pass Expired" : timeLeft || "Calculating validity..."}
            </span>
          </div>
          <StatusBadge status={permission.status} />
        </div>

        <CardContent className="p-4 sm:p-6 md:p-8 flex flex-col items-center text-center space-y-5 sm:space-y-6 min-w-0">
          {/* QR Code Container */}
          <div className="p-3 sm:p-4 rounded-2xl bg-white shadow-2xl ring-4 ring-emerald-500/20 transition-all hover:scale-[1.02] max-w-full">
            {qrError ? (
              <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 flex items-center justify-center bg-zinc-100 rounded-lg max-w-full p-4">
                <p className="text-sm text-zinc-700 font-medium">{qrError}</p>
              </div>
            ) : qrImage ? (
              <img
                src={qrImage}
                alt="Gate Pass QR Code"
                className="w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 max-w-full aspect-square object-contain mx-auto"
              />
            ) : (
              <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 flex items-center justify-center bg-zinc-100 rounded-lg max-w-full">
                <QrCode className="h-12 w-12 sm:h-14 sm:w-14 text-zinc-400 animate-pulse" />
              </div>
            )}
          </div>

          {/* Student & Pass Meta */}
          <div className="w-full space-y-2.5 pt-1 min-w-0">
            <div className="flex items-center justify-between py-2 px-3 sm:px-4 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs gap-2 min-w-0">
              <span className="text-zinc-500 shrink-0">Student</span>
              <span className="text-zinc-200 font-medium truncate max-w-[160px] sm:max-w-[280px]">
                {user.name} ({student.studentRoll})
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 sm:px-4 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs gap-2 min-w-0">
              <span className="text-zinc-500 shrink-0">Purpose</span>
              <span className="text-zinc-200 font-medium truncate max-w-[160px] sm:max-w-[280px]">
                {permission.purpose}
              </span>
            </div>
            {permission.destination && (
              <div className="flex items-center justify-between py-2 px-3 sm:px-4 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs gap-2 min-w-0">
                <span className="text-zinc-500 shrink-0">Destination</span>
                <span className="text-zinc-200 font-medium truncate max-w-[160px] sm:max-w-[280px]">
                  {permission.destination}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-2 px-3 sm:px-4 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs gap-2 min-w-0">
              <span className="text-zinc-500 shrink-0">Valid Until</span>
              <span className="text-amber-400 font-medium truncate max-w-[160px] sm:max-w-[280px]">
                {permission.qr?.expiresAt
                  ? formatDateTime(permission.qr.expiresAt)
                  : "End of allocated slot"}
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 max-w-sm">
            {isHostelPass ? (
              <>This QR code refreshes automatically every minute — screenshots will not work. Once your warden scans it, your arrival at the hostel is recorded and this pass is completed.</>
            ) : (
              <>
                This QR code refreshes automatically every minute — screenshots will not work at the gate.
                Once scanned by security, your {permission.type === "ENTRY" ? "entry" : "exit"} will be logged and this pass will be completed.
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
      <div className="space-y-6 animate-scale-in">
      {/* Title */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/10 mb-2">
          <Hourglass className="h-8 w-8 animate-spin" style={{ animationDuration: "6s" }} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          {permission.type === "ENTRY" ? "Entry Request Pending Approval" : "Exit Request Pending Approval"}
        </h1>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Your campus {permission.type === "ENTRY" ? "entry" : "exit"} pass request has been submitted and is currently awaiting approval from your{" "}
          <span className="text-amber-400 font-semibold">{approverLabel}</span>
          {permission.approverName ? ` (${permission.approverName})` : ""}.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Details Card */}
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {permission.type === "ENTRY" ? "Entry Request Summary" : "Exit Request Summary"}
          </span>
          <StatusBadge status="PENDING" />
        </div>

        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">Purpose</span>
              <span className="text-zinc-200 font-medium text-sm">
                {permission.purpose}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">{permission.type === "ENTRY" ? "Coming From" : "Destination"}</span>
              <span className="text-zinc-200 font-medium text-sm">
                {permission.destination || "Not specified"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">{permission.type === "ENTRY" ? "Entry Date" : "Exit Date"}</span>
              <span className="text-zinc-200 font-medium">
                {permission.exitDate ? formatDateTime(permission.exitDate).split(",")[0] : "Today"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">{permission.type === "ENTRY" ? "Expected Entry Time" : "Expected Exit Time"}</span>
              <span className="text-zinc-200 font-medium">
                {permission.expectedExit ? formatDateTime(permission.expectedExit).split(", ")[1] : "--:--"}
              </span>
            </div>
          </div>

          {permission.remarks && (
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs">
              <span className="text-zinc-500 block mb-1">Remarks</span>
              <span className="text-zinc-300">{permission.remarks}</span>
            </div>
          )}

          {/* Live waiting indicator */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
            <p className="text-xs text-amber-300/90 leading-relaxed">
              This page automatically refreshes every few seconds. Once approved, your QR pass will appear here instantly.
            </p>
          </div>

          {/* Cancel button */}
          <div className="pt-2 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => setShowCancelDialog(true)}
              className="text-zinc-400 hover:text-red-400 hover:border-red-500/40"
            >
              <XCircle className="h-4 w-4 mr-2" />
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

  const [hideExpiryAlert, setHideExpiryAlert] = useState<boolean>(false);

  const wasExpired =
    latestPermission?.status === "EXPIRED" ||
    (latestPermission?.status === "APPROVED" &&
      latestPermission?.qr &&
      !latestPermission.qr.usedForExit &&
      new Date(latestPermission.qr.expiresAt) <= new Date());

  useEffect(() => {
    if (wasExpired && !hideExpiryAlert) {
      const timer = setTimeout(() => setHideExpiryAlert(true), 8000);
      return () => clearTimeout(timer);
    }
  }, [wasExpired, hideExpiryAlert]);

  const isOutside = student?.status === "OUTSIDE";
  const [requestType, setRequestType] = useState<"EXIT" | "ENTRY" | "HOSTEL">(() => isOutside ? "ENTRY" : "EXIT");
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
    <div className="space-y-6 animate-scale-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          {requestType === "ENTRY" ? "Request Campus Entry Pass" : requestType === "HOSTEL" ? "Request Hostel Pass" : "Request Campus Exit Pass"}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {requestType === "ENTRY"
            ? "Submit an entry request to obtain approval and an Entry QR code to enter campus."
            : requestType === "HOSTEL"
            ? "Going from college to the hostel. Your HOD approves it and your hostel warden scans the QR when you arrive."
            : "Submit an exit request to leave the campus."}
        </p>
      </div>

      {/* Toggle between EXIT and ENTRY */}
      <div className="flex gap-2 sm:gap-3">
        <button 
          type="button"
          onClick={() => setRequestType("EXIT")}
          className={`flex-1 rounded-xl border-2 px-3 sm:px-6 py-3 sm:py-4 transition-all cursor-pointer text-left min-w-0 ${
            requestType === "EXIT"
              ? "border-orange-500 bg-orange-500/15 ring-2 ring-orange-500/20"
              : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40 opacity-70"
          }`}
        >
          <div className={`flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${requestType === "EXIT" ? "text-orange-400 font-bold" : "text-zinc-400"}`}>
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="truncate">EXIT Pass</span>
          </div>
          <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-1 truncate">Leave campus</p>
        </button>
        
        <button 
          type="button"
          onClick={() => setRequestType("ENTRY")}
          className={`flex-1 rounded-xl border-2 px-3 sm:px-6 py-3 sm:py-4 transition-all cursor-pointer text-left min-w-0 ${
            requestType === "ENTRY"
              ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/20"
              : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40 opacity-70"
          }`}
        >
          <div className={`flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${requestType === "ENTRY" ? "text-emerald-400 font-bold" : "text-zinc-400"}`}>
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="truncate">ENTRY Pass</span>
          </div>
          <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-1 truncate">Enter campus</p>
        </button>

        {isHosteller && (
          <button
            type="button"
            onClick={() => {
              setRequestType("HOSTEL");
              setFieldErrors({});
            }}
            className={`flex-1 rounded-xl border-2 px-3 sm:px-6 py-3 sm:py-4 transition-all cursor-pointer text-left min-w-0 ${
              requestType === "HOSTEL"
                ? "border-sky-500 bg-sky-500/15 ring-2 ring-sky-500/20"
                : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40 opacity-70"
            }`}
          >
            <div className={`flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${requestType === "HOSTEL" ? "text-sky-300 font-bold" : "text-zinc-400"}`}>
              <Home className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="truncate">HOSTEL Pass</span>
            </div>
            <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-1 truncate">Go to hostel</p>
          </button>
        )}
      </div>

      {/* Expiry Alert Banner */}
      {wasExpired && !hideExpiryAlert && (
        <div className="relative rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-2 animate-fade-in">
          <button 
            type="button"
            onClick={() => setHideExpiryAlert(true)}
            className="absolute top-4 right-4 text-amber-500/60 hover:text-amber-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-sm">
            <Clock className="h-5 w-5 flex-shrink-0" />
            <span>Gate Pass Expired</span>
          </div>
          <p className="text-xs text-zinc-300 pl-7 pr-6 leading-relaxed">
            Your previous approved gate pass for <span className="font-semibold text-white">&ldquo;{latestPermission.purpose}&rdquo;</span> expired because it was not scanned at the gate within the valid time window. You must submit a new request.
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <Card className={`border-zinc-800 bg-zinc-900/60 shadow-2xl transition-all ${requestType === "ENTRY" ? "border-emerald-500/20" : "border-orange-500/20"}`}>
        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <input type="hidden" name="type" value={requestType} />
            {/* Purpose */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <FileText className={`h-4 w-4 ${requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}`} />
                {requestType === "ENTRY" ? "Purpose of Campus Entry" : requestType === "HOSTEL" ? "Purpose of Going to Hostel" : "Purpose of Exit"} <span className={requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}>*</span>
              </label>

              <Input
                name="purpose"
                placeholder={requestType === "ENTRY" ? "e.g. Returning from home, Doctor visit return, Project return..." : "e.g. Doctor's appointment, Home visit, Project work..."}
                required
                error={fieldErrors.purpose}
                className={`bg-zinc-950/60 border-zinc-800 ${requestType === "ENTRY" ? "focus:border-emerald-500" : "focus:border-orange-500"}`}
              />
            </div>

            {/* Destination / Coming From (a hostel pass always goes to the hostel) */}
            {requestType !== "HOSTEL" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <MapPin className={`h-4 w-4 ${requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}`} />
                {requestType === "ENTRY" ? "Origin / Coming From Location" : "Destination / Location"} <span className={requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}>*</span>
              </label>
              <Input
                name="destination"
                placeholder={requestType === "ENTRY" ? "e.g. Home, Hospital, City Center" : "e.g. Apollo Hospital, City Center, Home"}
                required
                error={fieldErrors.destination}
                className={`bg-zinc-950/60 border-zinc-800 ${requestType === "ENTRY" ? "focus:border-emerald-500" : "focus:border-orange-500"}`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                  {requestType === "ENTRY" ? "Entry Date" : "Exit Date"} <span className={requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}>*</span>
                </label>
                <Input
                  type="date"
                  name="exitDate"
                  value={todayStr}
                  readOnly
                  required
                  className="bg-zinc-950/60 border-zinc-800 text-sm cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-zinc-500" />
                  {requestType === "ENTRY" ? "Expected Entry Time" : "Expected Exit Time"} <span className={requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}>*</span>
                </label>
                <TimeField name="expectedExit" required defaultToNow />
                {fieldErrors.expectedExit && <p className="text-xs text-red-400">{fieldErrors.expectedExit}</p>}
              </div>
            </div>
            )}

            {/* Contact Number */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Phone className={`h-4 w-4 ${requestType === "ENTRY" ? "text-emerald-400" : "text-orange-400"}`} />
                Emergency Contact Number
              </label>
              <Input
                name="contactNumber"
                type="tel"
                inputMode="tel"
                maxLength={15}
                placeholder="+91-9876543210"
                onInput={(e) => {
                  e.currentTarget.value = phoneOnly(e.currentTarget.value);
                }}
                error={fieldErrors.contactNumber}
                className={`bg-zinc-950/60 border-zinc-800 ${requestType === "ENTRY" ? "focus:border-emerald-500" : "focus:border-orange-500"}`}
              />
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Additional Remarks (Optional)
              </label>
              <Textarea
                name="remarks"
                placeholder="Any special notes or details..."
                rows={2}
                className={`bg-zinc-950/60 border-zinc-800 ${requestType === "ENTRY" ? "focus:border-emerald-500" : "focus:border-orange-500"} text-sm`}
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading || !(requestType === "HOSTEL" ? hostelPassApprover?.available : assignedApprover?.available)}
              className={`w-full h-11 text-white font-semibold text-sm cursor-pointer shadow-none ${
                requestType === "ENTRY"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
              }`}
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
  const label = "text-xs font-medium text-zinc-400 flex items-center gap-1.5";
  const inputCls = "bg-zinc-950/60 border-zinc-800 text-sm focus:border-orange-500";

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
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        {details.map((d) => (
          <div key={d.k} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{d.k}</p>
            <p className="text-sm font-medium text-zinc-200 truncate">{d.v || "—"}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="exitDate" className={label}>
            <Calendar className="h-3.5 w-3.5 text-zinc-500" /> Outing Date From <span className="text-orange-400">*</span>
          </label>
          <Input
            id="exitDate"
            type="date"
            name="exitDate"
            value={outingFrom}
            min={todayStr}
            max={maxDate}
            onChange={(e) => {
              setOutingFrom(e.target.value);
              if (outingTo < e.target.value) setOutingTo(e.target.value);
            }}
            required
            className={`${inputCls} [color-scheme:dark]`}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="outingDateTo" className={label}>
            <Calendar className="h-3.5 w-3.5 text-zinc-500" /> Outing Date To <span className="text-orange-400">*</span>
          </label>
          <Input
            id="outingDateTo"
            type="date"
            name="outingDateTo"
            value={outingTo}
            min={outingFrom}
            onChange={(e) => setOutingTo(e.target.value)}
            required
            error={fieldErrors.outingDateTo}
            className={`${inputCls} [color-scheme:dark]`}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="expectedExit" className={label}>
            <Clock className="h-3.5 w-3.5 text-zinc-500" /> Out Time (on the From date) <span className="text-orange-400">*</span>
          </label>
          <TimeField name="expectedExit" required defaultToNow />
          {fieldErrors.expectedExit && <p className="text-xs text-red-400">{fieldErrors.expectedExit}</p>}
        </div>
        <div className="space-y-2">
          <label htmlFor="inTime" className={label}>
            <Clock className="h-3.5 w-3.5 text-zinc-500" /> In Time (on the To date)
          </label>
          <TimeField name="inTime" />
          {fieldErrors.inTime && <p className="text-xs text-red-400">{fieldErrors.inTime}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-300">
          Informed to Parent / Guardian <span className="text-orange-400">*</span>
        </legend>
        <div className="flex gap-2">
          {(["yes", "no"] as const).map((v) => (
            <label
              key={v}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm text-center transition-colors ${
                informed === v ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-300 hover:bg-zinc-800/40"
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
