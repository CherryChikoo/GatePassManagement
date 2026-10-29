"use client";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { useT } from "@/components/providers/language-provider";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/primitives";
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
  Upload,
  Loader2,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
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
  const [selectedGate, setSelectedGate] = useState(gates[0]?.id || "");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCameraIntendedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          acceptPhoto(canvas.toDataURL("image/jpeg", 0.7));
          stopCamera();
          setState("verified");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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
    const finalNotes = verifyResult.manualOverride
      ? `[Manual roll-number entry]${notes ? " " + notes : ""}`
      : notes || undefined;

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
    setNotes("");
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
          <Card className="border-red-500/30 animate-scale-in">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-medium text-zinc-100">{t("Verification Failed")}</h2>
              <p role="alert" className="mt-2 text-base text-red-400 break-words">{error && tError(error)}</p>
              <Button onClick={resetScan} size="lg" className="mt-6 h-14 w-full text-base">
                <RotateCcw className="h-5 w-5" />
                {t("Try Again")}
              </Button>
            </CardContent>
          </Card>
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
              <Button onClick={resetScan} variant="ghost" className="h-11">
                {t("Cancel")}
              </Button>
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
                "flex items-center gap-4 rounded-3xl px-5 py-4 text-white shadow-card",
                isExit ? "bg-sky-600" : "bg-emerald-600"
              )}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
                {isExit ? <LogOut className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold leading-tight">{isExit ? t("Allow EXIT") : t("Allow ENTRY")}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-white/90">
                  <ShieldCheck className="h-4 w-4 shrink-0" /> {t("Valid pass")} · {t(passLabel)}
                </p>
              </div>
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

            {/* 2. The person: photo to compare, name, ID, call */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  {verifyResult.photoUrl ? (
                    <img
                      src={verifyResult.photoUrl}
                      alt={verifyResult.student.profile.name}
                      className="h-20 w-20 shrink-0 rounded-2xl border border-zinc-800 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl font-semibold text-orange-500">
                      {verifyResult.student.profile.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold leading-tight text-zinc-100 break-words">
                      {verifyResult.student.profile.name}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 font-mono text-sm font-semibold text-zinc-100">
                        {verifyResult.student.studentRoll}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-500">
                        {t(PERSON_TYPE[verifyResult.student.studentType] ?? verifyResult.student.studentType)}
                      </span>
                    </div>
                  </div>
                  {verifyResult.student.profile.phone && (
                    <a
                      href={`tel:${verifyResult.student.profile.phone}`}
                      aria-label={`${t("Call")} ${verifyResult.student.profile.phone}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-orange-500 transition-colors hover:border-orange-500/40"
                    >
                      <Phone className="h-5 w-5" />
                    </a>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  {verifyResult.student.studentType === "FACULTY" ? (
                    <>
                      <PersonFact label={t("Department")} value={verifyResult.student.department} />
                      <PersonFact label={t("Designation")} value={verifyResult.student.designation} />
                    </>
                  ) : (
                    <>
                      <PersonFact label={t("Department")} value={verifyResult.student.department} wide />
                      <PersonFact label={t("Year")} value={verifyResult.student.year} />
                      <PersonFact label={t("Section")} value={verifyResult.student.section} />
                    </>
                  )}
                  <PersonFact label={t("Mobile Number")} value={verifyResult.student.profile.phone} wide />
                </dl>
              </CardContent>
            </Card>

            {/* 3. The pass: what it is for, when, and who approved it */}
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-3.5">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <PassFact label={t("Purpose")} wide>{verifyResult.permission.purpose}</PassFact>
                  {verifyResult.permission.requestType ? (
                    <PassFact label={t("Request Type")}>{t(facultyRequestTypeLabel(verifyResult.permission.requestType))}</PassFact>
                  ) : (
                    verifyResult.permission.destination && <PassFact label={t("Destination")}>{verifyResult.permission.destination}</PassFact>
                  )}
                  {verifyResult.permission.expectedExit && (
                    <PassFact label={t("Exit Time")}>{formatDateTime(verifyResult.permission.expectedExit)}</PassFact>
                  )}
                  {verifyResult.permission.expectedReturn && (
                    <PassFact label={t("Return Time")}>{formatDateTime(verifyResult.permission.expectedReturn)}</PassFact>
                  )}
                  {verifyResult.permission.endDate && (
                    <PassFact label={t("Pass Dates")} wide>
                      <PassExtraDetails pass={verifyResult.permission} className="text-sm" />
                    </PassFact>
                  )}
                </dl>
                <ul className="space-y-2 border-t border-zinc-800 pt-3">
                  {(verifyResult.approvedBy ?? []).map((ap: { role: string; name: string; at: string | null }, i: number) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-emerald-600">
                          {t("Approved by")} {t(ap.role)}
                        </p>
                        <p className="mt-0.5 text-base font-semibold leading-snug text-zinc-100 break-words">
                          {ap.name || t(ap.role)}
                        </p>
                        <p className="mt-0.5 text-sm text-zinc-500">
                          {ap.at ? formatDateTime(ap.at) : t("Not filled")}
                        </p>
                      </div>
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
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button onClick={startPhotoCapture} size="lg" className="h-14 w-full text-base">
                          <Camera className="h-5 w-5" />
                          {t("Take Photo with Camera")}
                        </Button>
                        <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="h-14 w-full">
                          <Upload className="h-4 w-4" />
                          {t("Upload Photo / File")}
                        </Button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                      </div>
                    )}
                  </div>
                )}

                {/* Gate (plain text when there is only one) + optional note */}
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  {gates.length > 1 ? (
                    <Select label={t("Select Gate")} value={selectedGate} onChange={(e) => setSelectedGate(e.target.value)} id="gate-select" className="h-12">
                      {gates.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} {g.location ? `(${g.location})` : ""}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      {t("Gate")}: <span className="font-medium text-zinc-100">{gates[0]?.name ?? "—"}</span>
                    </p>
                  )}
                  <div>
                    <Textarea
                      label={t("Notes (optional)")}
                      placeholder={t("Tap a note below, or type here…")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      id="movement-notes"
                      rows={2}
                      maxLength={500}
                      className="min-h-[64px]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(isExit ? EXIT_NOTES : ENTRY_NOTES).map((n) => {
                        const text = t(n);
                        const picked = notes === text;
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={picked}
                            onClick={() => setNotes(picked ? "" : text)}
                            className={cn(
                              "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                              picked
                                ? "border-orange-500 bg-orange-500 text-white"
                                : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-orange-500/40"
                            )}
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
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
                {isExit ? t("Allow & Register EXIT") : t("Allow & Register ENTRY")}
              </Button>
              {needsPhoto && !capturedImage && (
                <p className="text-center text-xs text-zinc-500">{t("Take the photo first.")}</p>
              )}
              <Button onClick={resetScan} variant="ghost" className="h-12 w-full">
                {t("Cancel")}
              </Button>
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
                className="h-11 w-full rounded-full text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
              >
                {t("Cancel")}
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
              <Button onClick={resetScan} variant="ghost" className="h-11">
                {t("Cancel")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

/** Readable person type for the guard */
const PERSON_TYPE: Record<string, string> = { DAY_SCHOLAR: "Day scholar", HOSTELLER: "Hosteller", FACULTY: "Faculty" };

/** Ready-made notes the guard can tap instead of typing */
const EXIT_NOTES = ["All details checked", "Left with parent / guardian", "Medical reason", "ID card not shown"];
const ENTRY_NOTES = ["All details checked", "Came back late", "Came with parent / guardian", "ID card not shown"];

/** One detail about the person, in its own box ("Not filled" when empty) */
function PersonFact({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  const t = useT();
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5", wide && "col-span-2")}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={cn("mt-0.5 text-[15px] font-medium leading-snug break-words", empty ? "text-zinc-500" : "text-zinc-100")}>
        {empty ? t("Not filled") : value}
      </dd>
    </div>
  );
}

/** One fact about the pass: small label, value under it */
function PassFact({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium leading-snug text-zinc-100 break-words">{children}</dd>
    </div>
  );
}
