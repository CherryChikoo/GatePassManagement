"use client";
import { useT } from "@/components/providers/language-provider";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/primitives";
import { verifyQrScan, registerExit, registerEntry, prepareGatePhoto } from "@/server/actions/security";
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
  const [showNotes, setShowNotes] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCameraIntendedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Photo uploads in the background as soon as it is taken; Register just waits for it
  const photoUploadRef = useRef<Promise<string | null> | null>(null);

  function acceptPhoto(dataUrl: string) {
    setCapturedImage(dataUrl);
    const permissionId = verifyResult?.permission?.id;
    photoUploadRef.current = permissionId
      ? prepareGatePhoto(permissionId, dataUrl)
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
    setState("verifying");
    setError(null);

    try {
      const result = await verifyQrScan(token.trim());
      if (!result.valid) {
        setError(result.error || "Invalid QR code");
        setState("error");
        return;
      }

      setVerifyResult(result);
      setState("verified");
    } catch {
      setError("Could not verify the pass. Check the network connection and try again.");
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

    setState("registering");
    setError(null);

    // Manual roll-number lookups are recorded as such in the movement notes
    const finalNotes = verifyResult.manualOverride
      ? `[Manual roll-number entry]${notes ? " " + notes : ""}`
      : notes || undefined;

    try {
      // Use the photo already uploaded in the background; fall back to sending it now
      const uploaded = photoUploadRef.current ? await photoUploadRef.current : null;
      const photo = uploaded || capturedImage || undefined;
      let result;
      if (action === "EXIT") {
        result = await registerExit(verifyResult.permission.id, selectedGate, photo, finalNotes);
      } else {
        result = await registerEntry(verifyResult.permission.id, selectedGate, photo, finalNotes);
      }

      if (result.error) {
        setError(result.error);
        setState("error");
      } else {
        setSuccess(action === "EXIT" ? t("Exit registered successfully!") : t("Entry registered successfully!"));
        setState("done");
      }
    } catch {
      setError("Could not register the movement. Check the network connection and try again.");
      setState("error");
    }
  }

  // Reset to scan again
  function resetScan() {
    stopCamera();
    setState("idle");
    setVerifyResult(null);
    setCapturedImage(null);
    photoUploadRef.current = null;
    setManualToken("");
    setNotes("");
    setShowNotes(false);
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
            </CardContent>
          </Card>
        )}

        {/* VERIFIED — verdict, person, who approved, pass details, then photo and register */}
        {state === "verified" && verifyResult && (
          <div className="space-y-4 animate-scale-in">
            {verifyResult?.manualOverride && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {t("Found by roll number (no QR scanned). Verify the person's college ID card before allowing movement.")}
              </div>
            )}

            {/* Verdict: what the guard is allowing */}
            <div
              className={cn(
                "flex items-center gap-4 rounded-3xl px-5 py-4 text-white shadow-card",
                isExit ? "bg-sky-600" : "bg-emerald-600"
              )}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{t("Valid pass")}</p>
                <p className="mt-0.5 truncate text-sm text-white/90">
                  {isExit ? t("Allow EXIT") : t("Allow ENTRY")} · {t(passLabel)}
                </p>
              </div>
              {isExit ? <LogOut className="h-7 w-7 shrink-0" /> : <LogIn className="h-7 w-7 shrink-0" />}
            </div>

            {/* The person: photo to compare, name, ID, phone */}
            <Card>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-4">
                  {verifyResult.photoUrl ? (
                     
                    <img
                      src={verifyResult.photoUrl}
                      alt={verifyResult.student.profile.name}
                      className="h-20 w-20 shrink-0 rounded-2xl border border-zinc-800 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl font-semibold text-orange-400">
                      {verifyResult.student.profile.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold leading-tight text-zinc-100 break-words">
                      {verifyResult.student.profile.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 font-mono text-sm font-semibold text-zinc-100">
                        {verifyResult.student.studentRoll}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-400">
                        {t(PERSON_TYPE[verifyResult.student.studentType] ?? verifyResult.student.studentType)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-zinc-400">
                      {[
                        verifyResult.student.designation,
                        verifyResult.student.department,
                        verifyResult.student.year ? `${t("Year")} ${verifyResult.student.year}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                {verifyResult.student.profile.phone ? (
                  <a
                    href={`tel:${verifyResult.student.profile.phone}`}
                    className="flex h-12 items-center gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 text-base font-medium text-zinc-100 transition-colors hover:border-zinc-700"
                  >
                    <Phone className="h-4 w-4 text-orange-400" />
                    <span className="tabular-nums">{verifyResult.student.profile.phone}</span>
                    <span className="ml-auto text-xs font-medium text-orange-400">{t("Call")}</span>
                  </a>
                ) : (
                  <p className="text-sm text-zinc-500">{t("No phone provided")}</p>
                )}
              </CardContent>
            </Card>

            {/* Who approved it */}
            <Card>
              <CardContent className="p-5 sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t("Approved by")}</p>
                <ul className="mt-3 space-y-2.5">
                  {(verifyResult.approvedBy ?? []).map((a: { role: string; name: string; at: string | null }, i: number) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-base font-semibold text-zinc-100">{a.name || t(a.role)}</span>
                          {a.name && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">{t(a.role)}</span>
                          )}
                        </p>
                        {a.at && <p className="mt-0.5 text-xs text-zinc-500">{formatDateTime(a.at)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Pass details */}
            <Card>
              <CardContent className="p-5 sm:p-6">
                <dl className="grid grid-cols-2 gap-2.5">
                  <Detail label={t("Purpose")} wide>{verifyResult.permission.purpose}</Detail>
                  {verifyResult.permission.requestType ? (
                    <Detail label={t("Request Type")}>{t(facultyRequestTypeLabel(verifyResult.permission.requestType))}</Detail>
                  ) : (
                    <Detail label={t("Destination")}>{verifyResult.permission.destination || "—"}</Detail>
                  )}
                  {verifyResult.permission.expectedExit && (
                    <Detail label={t("Exit Time")}>{formatDateTime(verifyResult.permission.expectedExit)}</Detail>
                  )}
                  {verifyResult.permission.expectedReturn && (
                    <Detail label={t("Return Time")}>{formatDateTime(verifyResult.permission.expectedReturn)}</Detail>
                  )}
                  {verifyResult.permission.endDate && (
                    <Detail label={t("Pass Dates")} wide>
                      <PassExtraDetails pass={verifyResult.permission} className="text-sm" />
                    </Detail>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Step: photo (students); faculty passes need none */}
            {verifyResult.photoRequired === false ? (
              <div className="flex items-start gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-400">
                <Camera className="h-4 w-4 shrink-0 mt-0.5" />
                {t("Faculty pass — no photo needed. Check the details above and register.")}
              </div>
            ) : !capturedImage ? (
              <Card className="border-amber-500/30">
                <CardContent className="p-5 sm:p-6 space-y-3">
                  <p className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">1</span>
                    {isExit ? t("Take a photo for the exit") : t("Take a photo for the entry")}
                  </p>
                  <Button onClick={startPhotoCapture} size="lg" className="h-14 w-full text-base">
                    <Camera className="h-5 w-5" />
                    {t("Take Photo with Camera")}
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="h-12 w-full">
                    <Upload className="h-4 w-4" />
                    {t("Upload Photo / File")}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    { }
                    <img src={capturedImage} alt="Captured" className="h-24 w-24 shrink-0 rounded-2xl border border-zinc-800 object-cover" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <p className="flex items-center gap-2 text-base font-medium text-zinc-100">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                        {t("Photo Captured")}
                      </p>
                      <Button onClick={retakePhoto} variant="outline" className="h-11">
                        <RotateCcw className="h-4 w-4" />
                        {t("Retake")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Gate (plain text when there is only one) + optional note */}
            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                {gates.length > 1 ? (
                  <Select label={t("Select Gate")} value={selectedGate} onChange={(e) => setSelectedGate(e.target.value)} id="gate-select" className="h-12">
                    {gates.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.location ? `(${g.location})` : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-zinc-400">
                    {t("Gate")}: <span className="font-medium text-zinc-100">{gates[0]?.name ?? "—"}</span>
                  </p>
                )}
                {showNotes || notes ? (
                  <Textarea
                    label={t("Notes (optional)")}
                    placeholder={t("Any additional notes...")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    id="movement-notes"
                    rows={2}
                    className="min-h-[64px]"
                  />
                ) : (
                  <button type="button" onClick={() => setShowNotes(true)} className="text-sm font-medium text-orange-500 hover:text-orange-600">
                    + {t("Add a note")}
                  </button>
                )}
              </CardContent>
            </Card>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {tError(error)}
              </div>
            )}

            {/* Register */}
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
              <p className="-mt-2 text-center text-xs text-zinc-500">{t("Take the photo first.")}</p>
            )}

            <Button onClick={resetScan} variant="ghost" className="h-12 w-full">
              {t("Cancel")}
            </Button>
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
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

/** One pass detail tile in the verified card */
/** Readable person type for the guard */
const PERSON_TYPE: Record<string, string> = { DAY_SCHOLAR: "Day scholar", HOSTELLER: "Hosteller", FACULTY: "Faculty" };

function Detail({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 rounded-2xl bg-zinc-950 px-3.5 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-zinc-100 break-words">{children}</dd>
    </div>
  );
}
