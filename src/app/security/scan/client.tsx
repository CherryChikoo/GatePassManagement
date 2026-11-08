"use client";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { useT } from "@/components/providers/language-provider";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { callGate } from "@/lib/gate-call";
import { QrScanner } from "@/components/scan/qr-scanner";
import { cn, formatDateTime } from "@/lib/utils";
import {
  ScanLine,
  Camera,
  CheckCircle2,
  AlertTriangle,
  DoorOpen,
  RotateCcw,
  X,
  Phone,
  Loader2,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  House,
  BedDouble,
  Briefcase,
  Clock,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { GoBackButton } from "@/components/ui/go-back-button";
import { PassExtraDetails } from "@/components/passes/pass-extra";
import { facultyRequestTypeLabel } from "@/lib/registers/definitions";
import { formatDelay } from "@/lib/passes/return-scan";

interface Props {
  user: { name: string; email: string; role: string };
  gates: { id: string; name: string; location: string | null }[];
  /** Opened with ?scan=1 (from a "Scan" button): start the camera scanner right away */
  autoStart?: boolean;
}

type ScanState = "idle" | "scanning_qr" | "verifying" | "verified" | "capturing_photo" | "registering" | "done" | "error";

export function ScanClient({ user, gates, autoStart = false }: Props) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  // One gate for now (gate management comes later): the first gate
  const [selectedGate] = useState(gates[0]?.id || "");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCameraIntendedRef = useRef<boolean>(false);
  // Photo uploads in the background as soon as it is taken; Register just waits for it
  const photoUploadRef = useRef<Promise<string | null> | null>(null);
  // Bumped on every new scan / cancel: a late answer for an earlier scan is ignored
  const scanIdRef = useRef(0);

  function acceptPhoto(dataUrl: string) {
    setCapturedImage(dataUrl);
    const permissionId = verifyResult?.permission?.id;
    photoUploadRef.current = permissionId
      ? callGate("prepareGatePhoto", [permissionId, dataUrl], 20_000)
          .then((r: any) => (r && "path" in r && r.path ? (r.path as string) : null))
          .catch(() => null)
      : null;
  }


  // Stop any active camera stream
  const stopCamera = useCallback(() => {
    isCameraIntendedRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start QR scanning (the scanner component owns the camera)
  const startQrScanner = useCallback(() => {
    stopCamera();
    setError(null);
    setVerifyResult(null);
    setState("scanning_qr");
  }, [stopCamera]);

  // Opened from a "Scan" button (?scan=1): open the camera scanner right away,
  // then drop ?scan=1 from the address so a refresh doesn't reopen it.
  useEffect(() => {
    if (!autoStart) return;
    startQrScanner();
    window.history.replaceState(null, "", window.location.pathname);
  }, [autoStart, startQrScanner]);

  // Verify QR code once detected
  async function handleVerify(token: string) {
    const id = ++scanIdRef.current;
    setState("verifying");
    setError(null);

    try {
      const result: any = await callGate("verifyQrScan", [token.trim()], 15_000);
      if (id !== scanIdRef.current) return; // cancelled or a newer scan started
      if (!result?.valid) {
        setError(result?.error || "Invalid QR code");
        setState("error");
        return;
      }

      setVerifyResult(result);
      setState("verified");
    } catch (err: any) {
      if (id !== scanIdRef.current) return;
      setError(err?.message || "Could not verify the pass. Check the network connection and try again.");
      setState("error");
    }
  }

  // Start Photo Capture mode (after QR verification)
  const startPhotoCapture = async () => {
    stopCamera();
    isCameraIntendedRef.current = true;
    setState("capturing_photo");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!isCameraIntendedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera error:", err);
      stopCamera();
      setError("Camera access required for photo. Please allow camera access.");
      setState("error");
    }
  };

  // Capture photo
  function capturePhoto() {
    if (!videoRef.current) return;
    // Refuse to capture a blank frame (camera not started / not ready)
    if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setError("Camera is not ready yet. Wait a moment and try again.");
      return;
    }
    // Student gate photos are kept permanently, so store them at a modest size
    // (max 640 px wide) to stay within the free storage tier.
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / videoRef.current.videoWidth);
    canvas.width = Math.round(videoRef.current.videoWidth * scale);
    canvas.height = Math.round(videoRef.current.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      acceptPhoto(dataUrl);
      stopCamera();
      setState("verified");
    }
  }

  function retakePhoto() {
    setCapturedImage(null);
    photoUploadRef.current = null;
    startPhotoCapture();
  }

  // Register movement (EXIT or ENTRY)
  async function handleRegister() {
    if (!verifyResult || !selectedGate) return;
    const action = verifyResult.allowedAction as "EXIT" | "ENTRY";
    
    // Photo is required for students only; faculty passes are verified and marked
    const photoRequired = verifyResult.photoRequired !== false;
    if (photoRequired && !capturedImage) {
      setError(action === "EXIT" ? "Take the student's photo before registering the exit" : "Take the student's photo before registering the entry");
      return;
    }

    const id = scanIdRef.current;
    setState("registering");
    setError(null);

    // Manual roll-number lookups are recorded as such in the movement notes
    const finalNotes = verifyResult.manualOverride ? "[Manual roll-number entry]" : undefined;

    try {
      // Use the photo already uploaded in the background; fall back to sending it now
      const uploaded = photoUploadRef.current ? await photoUploadRef.current : null;
      if (id !== scanIdRef.current) return;
      const photo = uploaded || capturedImage || undefined;
      const result: any = await callGate(
        action === "EXIT" ? "registerExit" : "registerEntry",
        [verifyResult.permission.id, selectedGate, photo, finalNotes],
        // a photo still being sent with the request needs longer
        uploaded || !photo ? 15_000 : 30_000
      );
      if (id !== scanIdRef.current) return;

      if (result?.error) {
        // Stay on the pass with the reason above the Register button: the guard
        // can fix it (photo, gate) and try again without scanning again
        setError(result.error);
        setState("verified");
      } else {
        setSuccess(action === "EXIT" ? t("Exit registered successfully!") : t("Entry registered successfully!"));
        setState("done");
      }
    } catch (err: any) {
      if (id !== scanIdRef.current) return;
      // Timed out: it may have been saved just before the cut-off, so stay on
      // the pass. Registering again is safe (the server refuses a duplicate),
      // and scanning again shows what is now allowed.
      setError(
        err?.name === "TimeoutError"
          ? "Taking too long. It may already be saved — scan the pass again to check."
          : err?.message || "Could not register the movement. Check the network connection and try again."
      );
      // Stay on the pass either way: registering again is safe (a duplicate is refused)
      setState("verified");
    }
  }

  // Reset to scan again
  function resetScan() {
    scanIdRef.current++;
    stopCamera();
    setState("idle");
    setVerifyResult(null);
    setCapturedImage(null);
    photoUploadRef.current = null;
    setManualToken("");
    setError(null);
    setSuccess(null);
  }

  // After a successful registration: straight back to the camera for the next person
  function scanNext() {
    resetScan();
    startQrScanner();
  }

  // The bottom bar's Scan button while already on this page: fresh camera at once
  const scanNextRef = useRef(scanNext);
  useEffect(() => {
    scanNextRef.current = scanNext;
  });
  useEffect(() => {
    const open = () => scanNextRef.current();
    window.addEventListener("gatepass:open-scanner", open);
    return () => window.removeEventListener("gatepass:open-scanner", open);
  }, []);

  // Server messages in the reader's language (the dated one keeps its date)
  const tError = (msg: string) => {
    const m = /^This pass is valid only from (\d{4}-\d{2}-\d{2})\.$/.exec(msg);
    return m ? t("This pass is valid only from {date}.", { date: m[1] }) : t(msg);
  };

  // Back from the camera the screen keeps its place (the details stay mounted
  // underneath); once the photo is taken, the next step (Register) scrolls into view
  const registerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!capturedImage || state !== "verified") return;
    const id = requestAnimationFrame(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => cancelAnimationFrame(id);
  }, [capturedImage, state]);

  // A new step (done, error, scanning, checking…) starts at the top: the page
  // was scrolled down to Register, and the next screen is much shorter
  useEffect(() => {
    if (state === "verified" || state === "capturing_photo" || state === "registering") return;
    scrollPageToTop();
  }, [state]);

  const isExit = verifyResult?.allowedAction === "EXIT";
  const needsPhoto = verifyResult?.photoRequired !== false;
  const passLabel = !verifyResult
    ? ""
    : verifyResult.permission?.requestType
    ? facultyRequestTypeLabel(verifyResult.permission.requestType)
    : verifyResult.student?.studentType === "HOSTELLER" && verifyResult.permission?.endDate
    ? "Outing pass"
    : verifyResult.permission?.type === "ENTRY"
    ? "Entry pass"
    : "Exit pass";

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6 pb-2">
        <div className="min-w-0">
          <GoBackButton className="mb-3" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <ScanLine className="h-5 w-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
              {t("Scan & Register")}
            </h1>
          </div>
        </div>

        {/* SUCCESS STATE */}
        {state === "done" && (
          <Card className="border-emerald-500/30 animate-scale-in">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h2 className="text-xl font-medium text-zinc-100">{success}</h2>
              <p className="mt-1.5 text-base text-zinc-300 break-words">
                <span className="font-medium text-zinc-100">{verifyResult?.student?.profile?.name}</span>
                {verifyResult?.student?.studentRoll && (
                  <span className="text-zinc-500"> · {verifyResult?.student?.studentRoll}</span>
                )}
              </p>
              <Button onClick={scanNext} size="lg" className="mt-6 h-14 w-full text-base">
                <ScanLine className="h-5 w-5" />
                {t("Scan Next")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ERROR STATE */}
        {state === "error" && (
          <div role="alert" className="overflow-hidden rounded-3xl border-2 border-red-500 bg-zinc-900 shadow-card animate-scale-in">
            <div className="flex items-center justify-center gap-3 bg-red-600 px-5 py-5 text-white">
              <AlertTriangle className="h-8 w-8 shrink-0" aria-hidden="true" />
              <h2 className="text-2xl font-bold leading-tight">{t("Verification Failed")}</h2>
            </div>
            <div className="space-y-5 p-5 text-center sm:p-6">
              <p className="break-words text-xl font-bold leading-snug text-red-700">{error && tError(error)}</p>
              <Button onClick={resetScan} size="lg" className="h-14 w-full text-lg">
                <RotateCcw className="h-5 w-5" />
                {t("Try Again")}
              </Button>
            </div>
          </div>
        )}

        {/* IDLE */}
        {state === "idle" && (
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-5">
              <p className="text-sm text-zinc-500 leading-relaxed">
                {t("Point your camera at a student's QR code to verify their permission, or enter their Roll Number / Pass Code manually.")}
              </p>
              <Button onClick={startQrScanner} size="lg" className="h-16 w-full text-base">
                <ScanLine className="h-5 w-5" />
                {t("Open Camera Scanner")}
              </Button>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t("Or Verify Manually")}</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder={t("Enter Roll Number or Token...")}
                    aria-label={t("Enter Roll Number or Token...")}
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualToken.trim()) {
                        handleVerify(manualToken.trim());
                      }
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-11 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
                  />
                </div>
                <Button
                  onClick={() => manualToken.trim() && handleVerify(manualToken.trim())}
                  disabled={!manualToken.trim()}
                  variant="outline"
                  className="h-12 shrink-0 px-5"
                >
                  {t("Verify Pass")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SCANNING QR */}
        {state === "scanning_qr" && (
          <QrScanner
            title="Scan gate pass"
            onResult={handleVerify}
            // "Enter roll number instead": stay here for manual entry
            onCancel={resetScan}
            // ✕: back to the registers home
            onClose={() => {
              resetScan();
              router.push("/security");
            }}
          />
        )}

        {/* VERIFYING */}
        {state === "verifying" && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-400" />
              <p className="text-base font-medium text-zinc-200">{t("Verifying pass…")}</p>
<button
                type="button"
                onClick={resetScan}
                className="mx-auto flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 px-6 text-base font-bold text-red-600 hover:bg-red-100"
              >
                <X className="h-5 w-5" /> {t("Cancel")}
              </button>
            </CardContent>
          </Card>
        )}

        {/* VERIFIED — kept on screen under the camera, so coming back from a photo keeps the place */}
        {(state === "verified" || state === "capturing_photo") && verifyResult && (
          <div className="space-y-3 animate-scale-in">
            {verifyResult?.manualOverride && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {t("Found by roll number (no QR scanned). Verify the person's college ID card before allowing movement.")}
              </div>
            )}

            {/* 1. The verdict: what the guard is allowing */}
            <div
              className={cn(
                "flex items-center justify-center gap-3 rounded-3xl px-5 py-5 text-white shadow-card",
                isExit ? "bg-sky-600" : "bg-emerald-600"
              )}
            >
              {isExit ? <LogOut className="h-7 w-7 shrink-0" aria-hidden="true" /> : <LogIn className="h-7 w-7 shrink-0" aria-hidden="true" />}
              <p className="text-2xl font-bold leading-tight">{isExit ? t("Send out") : t("Let in")}</p>
            </div>

            {/* Came back after the planned return: still allowed, recorded as a delayed return */}
            {verifyResult.delayedMinutes > 0 && (
              <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {t("Delayed return — {time} late", { time: formatDelay(verifyResult.delayedMinutes) })}
                  {verifyResult.returnDueAt && (
                    <span className="block text-xs font-normal text-amber-700/80">
                      {t("Was due back {date}", { date: formatDateTime(verifyResult.returnDueAt) })}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* 2. The person: photo to compare, name, roll number, then each detail on its own row */}
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  {verifyResult.photoUrl ? (
                    <img
                      src={verifyResult.photoUrl}
                      alt={verifyResult.student.profile.name}
                      className="h-24 w-24 shrink-0 rounded-2xl border-[1.5px] border-zinc-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-4xl font-bold text-orange-500">
                      {verifyResult.student.profile.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="break-words text-2xl font-bold leading-tight text-zinc-100">{verifyResult.student.profile.name}</h2>
                    {verifyResult.student.studentRoll && (
                      <p className="inline-block break-all rounded-xl border-2 border-zinc-700 bg-zinc-950 px-3 py-1 text-xl font-bold tabular-nums tracking-wider text-zinc-100">
                        {verifyResult.student.studentRoll}
                      </p>
                    )}
                    <div>
                      {(() => {
                        const type = verifyResult.student.studentType;
                        const TypeIcon = type === "HOSTELLER" ? BedDouble : type === "DAY_SCHOLAR" ? House : Briefcase;
                        return (
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-lg font-bold text-white shadow-sm",
                              type === "HOSTELLER" ? "bg-sky-600" : type === "DAY_SCHOLAR" ? "bg-amber-600" : "bg-purple-600"
                            )}
                          >
                            <TypeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            {t(PERSON_TYPE[type] ?? type)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
                  <FactRow label={t("Department")} value={verifyResult.student.department} />
                  {verifyResult.student.studentType === "FACULTY" ? (
                    <FactRow label={t("Designation")} value={verifyResult.student.designation} />
                  ) : (
                    <>
                      <FactRow label={t("Year")} value={verifyResult.student.year} />
                      <FactRow label={t("Section")} value={verifyResult.student.section} />
                    </>
                  )}
                  <FactRow
                    label={t("Mobile Number")}
                    value={
                      verifyResult.student.profile.phone ? (
                        <a
                          href={`tel:${verifyResult.student.profile.phone}`}
                          aria-label={`${t("Call")} ${verifyResult.student.profile.phone}`}
                          className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-600 px-4 text-base font-bold tabular-nums text-white hover:bg-orange-700"
                        >
                          <Phone className="h-4 w-4 shrink-0" /> {verifyResult.student.profile.phone}
                        </a>
                      ) : null
                    }
                  />
                </dl>
              </CardContent>
            </Card>

            {/* 3. The pass: what it is for, when, and who approved it */}
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
                  <ShieldCheck className="h-5 w-5 text-orange-500" aria-hidden="true" /> {t("Pass details")}
                </h3>
                <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
                  <FactRow label={t("Purpose")} value={verifyResult.permission.purpose} />
                  {verifyResult.permission.requestType ? (
                    <FactRow label={t("Request Type")} value={t(facultyRequestTypeLabel(verifyResult.permission.requestType))} />
                  ) : (
                    verifyResult.permission.destination && <FactRow label={t("Destination")} value={verifyResult.permission.destination} />
                  )}
                  {verifyResult.permission.expectedExit && (
                    <FactRow label={t("Exit Time")} value={formatDateTime(verifyResult.permission.expectedExit)} />
                  )}
                  {verifyResult.permission.expectedReturn && (
                    <FactRow label={t("Return Time")} value={formatDateTime(verifyResult.permission.expectedReturn)} />
                  )}
                  {verifyResult.permission.endDate && (
                    <FactRow label={t("Pass Dates")} stacked value={<PassExtraDetails pass={verifyResult.permission} className="text-base" />} />
                  )}
                </dl>
                <ul className="space-y-2">
                  {(verifyResult.approvedBy ?? []).map((ap: { role: string; name: string; at: string | null }, i: number) => (
                    <li key={i} className="space-y-2 rounded-2xl border-[1.5px] border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
                      <p className="flex items-center gap-2 text-base font-bold text-emerald-700">
                        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> {t("Approved by")}
                      </p>
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-xl font-bold leading-snug text-zinc-100">{ap.name || t(ap.role)}</span>
                        {ap.name && (
                          <span className="rounded-lg bg-emerald-600 px-2.5 py-0.5 text-sm font-bold text-white">{t(ap.role)}</span>
                        )}
                      </p>
                      {ap.at && (
                        <p className="flex items-center gap-1.5 text-base font-medium tabular-nums text-zinc-500">
                          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> {formatDateTime(ap.at)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* 4. Steps: photo (students), then register */}
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {verifyResult.photoRequired === false ? (
                  <p className="flex items-start gap-2.5 rounded-2xl bg-sky-500/10 px-4 py-3 text-sm text-sky-500">
                    <Camera className="h-4 w-4 shrink-0 mt-0.5" />
                    {t("Faculty pass — no photo needed. Check the details above and register.")}
                  </p>
                ) : (
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white", capturedImage ? "bg-emerald-600" : "bg-orange-600")}>
                        {capturedImage ? <CheckCircle2 className="h-4 w-4" /> : "1"}
                      </span>
                      {isExit ? t("Take a photo for the exit") : t("Take a photo for the entry")}
                    </p>
                    {capturedImage ? (
                      <div className="mt-3 flex items-center gap-3">
                        <img src={capturedImage} alt={t("Photo Captured")} className="h-20 w-20 shrink-0 rounded-2xl border border-zinc-800 object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-emerald-600">{t("Photo Captured")}</p>
                          <Button onClick={retakePhoto} variant="outline" className="mt-2 h-11">
                            <RotateCcw className="h-4 w-4" />
                            {t("Retake")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Camera only: a live photo at the gate (no uploading a saved picture)
                      <Button onClick={startPhotoCapture} size="lg" className="mt-3 h-16 w-full text-lg">
                        <Camera className="h-6 w-6" />
                        {t("Take Photo with Camera")}
                      </Button>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3.5 text-lg font-bold leading-snug text-red-700">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
                {tError(error)}
              </div>
            )}

            {/* Register */}
            <div ref={registerRef} className="space-y-2 pt-1">
              <Button
                onClick={handleRegister}
                size="lg"
                variant={isExit ? "default" : "success"}
                className="h-16 w-full text-lg"
                disabled={needsPhoto && !capturedImage}
              >
                <DoorOpen className="h-5 w-5" />
                {isExit ? t("Send out") : t("Let in")}
              </Button>
<button
                type="button"
                onClick={resetScan}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 text-lg font-bold text-red-600 transition-[background-color,transform] hover:bg-red-100 active:scale-[0.98]"
              >
                <X className="h-5 w-5" /> {t("Cancel")}
              </button>
            </div>
          </div>
        )}

        {/* CAPTURING PHOTO — full-screen camera */}
        {state === "capturing_photo" && (
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
            role="dialog"
            aria-modal="true"
            aria-label={t("Capture Student Photo")}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 pb-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <h3 className="flex min-w-0 items-center gap-2 text-base font-medium truncate">
                <Camera className="h-5 w-5 shrink-0" />
                {t("Capture Student Photo")}
              </h3>
              <button
                type="button"
                onClick={() => { stopCamera(); setState("verified"); }}
                aria-label={t("Cancel")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover sm:object-contain"
              />
            </div>

            <div
              className="mx-auto w-full max-w-md space-y-3 px-4 pt-4"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            >
              {error && (
                <p role="alert" className="rounded-2xl bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white">
                  {tError(error)}
                </p>
              )}
              <Button onClick={capturePhoto} size="lg" className="h-16 w-full text-base">
                <Camera className="h-5 w-5" />
                {t("Capture Photo")}
              </Button>
              <button
                type="button"
                onClick={() => { stopCamera(); setState("verified"); }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/60 text-base font-bold text-white transition-colors hover:bg-white/10"
              >
                <X className="h-5 w-5" /> {t("Cancel")}
              </button>
            </div>
          </div>
        )}

        {/* REGISTERING */}
        {state === "registering" && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-400" />
              <p className="text-base font-medium text-zinc-200">{t("Registering…")}</p>
<button
                type="button"
                onClick={resetScan}
                className="mx-auto flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 px-6 text-base font-bold text-red-600 hover:bg-red-100"
              >
                <X className="h-5 w-5" /> {t("Cancel")}
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

/** Readable person type for the guard */
const PERSON_TYPE: Record<string, string> = { DAY_SCHOLAR: "Day Scholar", HOSTELLER: "Hosteller", FACULTY: "Faculty" };

/**
 * One detail on its own row: the label on the left, the value large and bold on
 * the right (so even a one-letter section like "C" is easy to read); "Not filled" when empty.
 * stacked: the value under the label (long text such as the pass dates).
 */
function FactRow({ label, value, stacked = false }: { label: string; value: React.ReactNode; stacked?: boolean }) {
  const t = useT();
  const empty = value === null || value === undefined || value === "" || value === false;
  return (
    <div className={cn("px-4 py-3", stacked ? "space-y-1" : "flex flex-wrap items-center justify-between gap-x-4 gap-y-1")}>
      <dt className="shrink-0 text-base text-zinc-500">{label}</dt>
      <dd className={cn("min-w-0 break-words leading-snug", stacked ? "" : "text-right", empty ? "text-base text-zinc-500" : "text-lg font-bold text-zinc-100")}>
        {empty ? t("Not filled") : value}
      </dd>
    </div>
  );
}
