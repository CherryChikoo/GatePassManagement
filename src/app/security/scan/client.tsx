"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { verifyQrScan, registerExit, registerEntry } from "@/server/actions/security";
import { formatDateTime } from "@/lib/utils";
import {
  ScanLine,
  Camera,
  CheckCircle2,
  AlertTriangle,
  DoorOpen,
  RotateCcw,
  ShieldCheck,
  X,
  Phone,
  Upload,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { PassExtraDetails } from "@/components/passes/pass-extra";
import { facultyRequestTypeLabel } from "@/lib/registers/definitions";

interface Props {
  user: { name: string; email: string; role: string };
  gates: { id: string; name: string; location: string | null }[];
}

type ScanState = "idle" | "scanning_qr" | "verified" | "capturing_photo" | "registering" | "done" | "error";

export function ScanClient({ user, gates }: Props) {
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
  const scanLoopRef = useRef<number | null>(null);
  const isCameraIntendedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setCapturedImage(canvas.toDataURL("image/jpeg", 0.7));
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
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start QR Scanning mode
  const startQrScanner = async () => {
    stopCamera();
    isCameraIntendedRef.current = true;
    setState("scanning_qr");
    setError(null);
    setVerifyResult(null);

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
        videoRef.current.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
        await videoRef.current.play();
        scanLoop();
      }
    } catch (err) {
      console.error("Camera error:", err);
      stopCamera();
      setError("Camera access required to scan QR code. Please allow camera access.");
      setState("error");
    }
  };

  const scanLoop = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      scanLoopRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        stopCamera();
        handleVerify(code.data);
        return;
      }
    }

    scanLoopRef.current = requestAnimationFrame(scanLoop);
  };

  // Verify QR code once detected
  async function handleVerify(token: string) {
    setState("registering"); // Temporary loading state
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
      setCapturedImage(dataUrl);
      stopCamera();
      setState("verified");
    }
  }

  function retakePhoto() {
    setCapturedImage(null);
    startPhotoCapture();
  }

  // Register movement (EXIT or ENTRY)
  async function handleRegister() {
    if (!verifyResult || !selectedGate) return;
    const action = verifyResult.allowedAction as "EXIT" | "ENTRY";
    
    // Photo is required for students only; faculty passes are verified and marked
    const photoRequired = verifyResult.photoRequired !== false;
    if (photoRequired && !capturedImage) {
      setError(`Photo is mandatory for ${action === "EXIT" ? "exit" : "entry"} registration`);
      return;
    }

    setState("registering");
    setError(null);

    // Manual roll-number lookups are recorded as such in the movement notes
    const finalNotes = verifyResult.manualOverride
      ? `[Manual roll-number entry]${notes ? " " + notes : ""}`
      : notes || undefined;

    try {
      let result;
      if (action === "EXIT") {
        result = await registerExit(verifyResult.permission.id, selectedGate, capturedImage || undefined, finalNotes);
      } else {
        result = await registerEntry(verifyResult.permission.id, selectedGate, capturedImage || undefined, finalNotes);
      }

      if (result.error) {
        setError(result.error);
        setState("error");
      } else {
        setSuccess(`${action === "EXIT" ? "Exit" : "Entry"} registered successfully!`);
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
    setManualToken("");
    setNotes("");
    setError(null);
    setSuccess(null);
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        <div>
          <BackButton href="/security" label="Back to Dashboard" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Scan & Register
          </h1>
        </div>

        {/* SUCCESS STATE */}
        {state === "done" && (
          <Card className="border-emerald-500/30 animate-scale-in">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">{success}</h2>
              <p className="text-sm text-zinc-500 mb-6">
                {verifyResult?.student?.profile?.name} —{" "}
                {verifyResult?.student?.studentRoll}
              </p>
              <Button onClick={resetScan} size="lg">
                <ScanLine className="h-4 w-4" />
                Scan Next
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ERROR STATE */}
        {state === "error" && (
          <Card className="border-red-500/30 animate-scale-in">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 mb-4">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">
                Verification Failed
              </h2>
              <p className="text-sm text-red-400 mb-6">{error}</p>
              <Button onClick={resetScan} variant="outline">
                <RotateCcw className="h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* IDLE */}
        {state === "idle" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-red-400" />
                Start Scanner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-500 text-center py-4">
                Point your camera at a student's QR code to verify their permission, or enter their Roll Number / Pass Code manually.
              </p>
              <Button
                onClick={startQrScanner}
                className="w-full bg-red-600 hover:bg-red-500 text-white"
                size="lg"
              >
                <ScanLine className="h-4 w-4" />
                Open Camera Scanner
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-zinc-500">Or Verify Manually</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Enter Roll Number or Token..."
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualToken.trim()) {
                      handleVerify(manualToken.trim());
                    }
                  }}
                  className="w-full sm:flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
                <Button
                  onClick={() => manualToken.trim() && handleVerify(manualToken.trim())}
                  disabled={!manualToken.trim()}
                  variant="outline"
                  className="w-full sm:w-auto shrink-0 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  Verify Pass
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SCANNING QR */}
        {state === "scanning_qr" && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col sm:relative sm:z-auto sm:bg-transparent">
            {/* Header for mobile */}
            <div className="sm:hidden flex items-center justify-between p-4 bg-zinc-950/80 backdrop-blur-md absolute top-0 left-0 right-0 z-10 border-b border-zinc-800/50">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-indigo-400" />
                Scan QR Code
              </h3>
              <button onClick={resetScan} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center sm:block">
              <Card className="sm:border sm:border-zinc-800 border-none bg-transparent sm:bg-zinc-900 rounded-none sm:rounded-xl">
                <CardContent className="p-0 sm:p-6 space-y-4 text-center h-full flex flex-col justify-center">
                  <h3 className="hidden sm:block font-bold text-zinc-200">Scanning QR Code...</h3>
                  <div className="relative overflow-hidden sm:rounded-xl border-y-2 sm:border-2 border-indigo-500/50 w-full flex-1 sm:flex-none flex items-center bg-black">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover sm:h-auto"
                      style={{ minHeight: "100%", maxHeight: "100vh" }}
                    />
                    {/* Viewfinder overlay */}
                    <div className="absolute inset-0 pointer-events-none border-[60px] sm:border-[40px] border-black/60 flex items-center justify-center">
                       <div className="w-full h-full border-2 border-white/50 rounded-lg relative">
                         {/* Scanning animation line */}
                         <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_15px_3px_rgba(99,102,241,0.8)]"></div>
                       </div>
                    </div>
                  </div>
                  <Button onClick={resetScan} variant="outline" className="w-full hidden sm:flex">
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* VERIFIED — Show student info + actions */}
        {state === "verified" && verifyResult && (
          <>
            {/* Mobile overlay backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] sm:hidden" onClick={resetScan} />
            
            <div className="fixed inset-x-0 bottom-0 z-[100] p-4 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/50 sm:relative sm:inset-auto sm:p-0 sm:bg-transparent sm:border-none sm:backdrop-blur-none animate-slide-up sm:animate-none pb-8 sm:pb-0 space-y-4 max-h-[90vh] overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-none rounded-t-3xl sm:rounded-none">
              {/* Mobile drag handle */}
              <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-2 sm:hidden" />
              
              {/* Student Info Card */}
            <Card className="border-indigo-500/30">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 mb-4">
                  <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-lg sm:text-xl font-bold shrink-0">
                    {verifyResult.student.profile.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-zinc-100 truncate">
                        {verifyResult.student.profile.name}
                      </h2>
                      <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {verifyResult.student.studentType}
                      </span>
                      <span className={`text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-md border ${
                        verifyResult.allowedAction === "EXIT" 
                          ? "bg-red-500/15 text-red-400 border-red-500/30" 
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      }`}>
                        {verifyResult.allowedAction === "EXIT" ? "EXITING" : "ENTERING"}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-500 truncate mt-0.5">
                      {verifyResult.student.studentRoll} • {verifyResult.student.department || ""} {verifyResult.student.year ? `Year ${verifyResult.student.year}` : ""}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1 truncate">
                      <Phone className="h-3 w-3 shrink-0" />
                      {verifyResult.student.profile.phone || "No phone provided"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-800/30 px-4 py-3">
                    <p className="text-xs text-zinc-500">Purpose</p>
                    <p className="text-sm font-medium text-zinc-200">
                      {verifyResult.permission.purpose}
                    </p>
                  </div>
                  {verifyResult.permission.requestType ? (
                    <div className="rounded-xl bg-zinc-800/30 px-4 py-3">
                      <p className="text-xs text-zinc-500">Request Type</p>
                      <p className="text-sm font-medium text-zinc-200">
                        {facultyRequestTypeLabel(verifyResult.permission.requestType)}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-zinc-800/30 px-4 py-3">
                      <p className="text-xs text-zinc-500">Destination</p>
                      <p className="text-sm font-medium text-zinc-200">
                        {verifyResult.permission.destination || "—"}
                      </p>
                    </div>
                  )}
                  {verifyResult.permission.endDate && (
                    <div className="col-span-2 rounded-xl bg-zinc-800/30 px-4 py-3">
                      <p className="text-xs text-zinc-500">Pass Dates</p>
                      <PassExtraDetails pass={verifyResult.permission} className="text-sm" />
                    </div>
                  )}
                  {verifyResult.permission.expectedExit && (
                    <div className="rounded-xl bg-zinc-800/30 px-4 py-3">
                      <p className="text-xs text-zinc-500">Exit Time</p>
                      <p className="text-sm font-medium text-zinc-200">
                        {formatDateTime(verifyResult.permission.expectedExit)}
                      </p>
                    </div>
                  )}
                  {verifyResult.permission.expectedReturn && (
                    <div className="rounded-xl bg-zinc-800/30 px-4 py-3">
                      <p className="text-xs text-zinc-500">Entry Time</p>
                      <p className="text-sm font-medium text-zinc-200">
                        {formatDateTime(verifyResult.permission.expectedReturn)}
                      </p>
                    </div>
                  )}
                  <div className="col-span-2 rounded-xl bg-zinc-800/30 px-4 py-3">
                    <p className="text-xs text-zinc-500">Approved On</p>
                    <p className="text-sm font-medium text-zinc-200">
                      {verifyResult.permission.approvedAt
                        ? formatDateTime(verifyResult.permission.approvedAt)
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Select
              label="Select Gate"
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              id="gate-select"
            >
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} {g.location ? `(${g.location})` : ""}
                </option>
              ))}
            </Select>

            {verifyResult?.manualOverride && (
              <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Found by roll number (no QR scanned). Verify the person&apos;s college ID card before allowing movement.
              </div>
            )}

            {/* Faculty passes: verify details and mark — no photo */}
            {state === "verified" && verifyResult.photoRequired === false && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200 flex items-center gap-2">
                <Camera className="h-4 w-4 text-indigo-300 shrink-0" />
                Faculty pass — no photo needed. Check the details above and register the {verifyResult.allowedAction === "EXIT" ? "exit" : "entry"}.
              </div>
            )}

            {/* Camera / Photo Section (students only) */}
            {state === "verified" && verifyResult.photoRequired !== false && !capturedImage && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-zinc-400" />
                    <p className="font-medium text-zinc-200">
                      {verifyResult.allowedAction === "EXIT" ? "Photo Required for Exit" : "Photo Required for Entry"}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button onClick={startPhotoCapture} variant="outline" className="w-full">
                      <Camera className="h-4 w-4" />
                      Take Photo with Camera
                    </Button>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Photo / File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Captured Image Preview */}
            {capturedImage && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <p className="font-medium text-zinc-200 flex items-center gap-2">
                    <Camera className="h-4 w-4 text-emerald-400" />
                    Photo Captured
                  </p>
                  <img
                    src={capturedImage}
                    alt="Captured"
                    className="w-full rounded-xl border border-zinc-800"
                  />
                  <Button onClick={retakePhoto} variant="ghost" size="sm">
                    <RotateCcw className="h-4 w-4" />
                    Retake
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Textarea
              label="Notes (optional)"
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              id="movement-notes"
            />

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Register Button */}
            <Button
              onClick={handleRegister}
              size="lg"
              className={`w-full ${
                verifyResult.allowedAction === "EXIT" 
                  ? "bg-red-600 hover:bg-red-500 text-white" 
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
              disabled={verifyResult.photoRequired !== false && !capturedImage}
            >
              <DoorOpen className="h-5 w-5" />
              Register {verifyResult.allowedAction}
            </Button>
            
            <Button onClick={resetScan} variant="ghost" className="w-full">
              Cancel
            </Button>
            </div>
          </>
        )}

        {/* CAPTURING PHOTO */}
        {state === "capturing_photo" && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col sm:relative sm:z-auto sm:bg-transparent">
            {/* Header for mobile */}
            <div className="sm:hidden flex items-center justify-between p-4 bg-zinc-950/80 backdrop-blur-md absolute top-0 left-0 right-0 z-10 border-b border-zinc-800/50">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Camera className="h-5 w-5 text-indigo-400" />
                Capture Photo
              </h3>
              <button onClick={() => { stopCamera(); setState("verified"); }} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center sm:block">
              <Card className="sm:border sm:border-zinc-800 border-none bg-transparent sm:bg-zinc-900 rounded-none sm:rounded-xl h-full sm:h-auto flex flex-col">
                <CardContent className="p-0 sm:p-6 space-y-0 sm:space-y-4 text-center flex-1 flex flex-col justify-center sm:block relative">
                  <h3 className="hidden sm:block font-bold text-zinc-200">Capture Student Photo</h3>
                  <div className="flex-1 sm:flex-none flex items-center bg-black relative w-full overflow-hidden sm:rounded-xl sm:border sm:border-zinc-800 pb-[80px] sm:pb-0">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover sm:h-auto"
                      style={{ minHeight: "100%", maxHeight: "100vh" }}
                    />
                  </div>
                  <div className="p-4 sm:p-0 space-y-3 bg-zinc-950 sm:bg-transparent absolute bottom-0 left-0 right-0 sm:relative border-t border-zinc-800 sm:border-none">
                    <Button
                      onClick={capturePhoto}
                      className="w-full"
                      size="lg"
                    >
                      <Camera className="h-4 w-4" />
                      Capture Photo
                    </Button>
                    <Button onClick={() => { stopCamera(); setState("verified"); }} variant="outline" className="w-full hidden sm:flex">
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* REGISTERING */}
        {state === "registering" && (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="animate-pulse">
                <ShieldCheck className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
                <p className="text-zinc-400">Processing...</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
