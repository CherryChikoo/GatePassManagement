"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, EmptyState } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { formatDateTime } from "@/lib/utils";
import { QrCode, Clock, MapPin, FileText, ShieldCheck, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { generateLiveQrToken } from "@/server/actions/permissions";

interface Props {
  user: { name: string; email: string; role: string };
  qrData: any;
}

export function QrDisplayClient({ user, qrData }: Props) {
  const router = useRouter();
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);
  const [hasExited, setHasExited] = useState(false);

  useEffect(() => {
    if (qrData?.qr?.usedForExit) {
      setHasExited(true);
    }

    const fetchToken = async () => {
      if (!qrData?.id || isExpired || hasExited) return;
      const res = await generateLiveQrToken(qrData.id);
      if (res.token) {
        QRCode.toDataURL(res.token, {
          width: 280,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "H",
        }).then(setQrImage);
      }
    };

    fetchToken();
    const qrInterval = setInterval(fetchToken, 30000);

    return () => clearInterval(qrInterval);
  }, [qrData, hasExited, isExpired]);

  // Real-time expiry countdown
  useEffect(() => {
    if (qrData?.qr?.usedForExit) {
      setHasExited(true);
    }

    const fetchToken = async () => {
      if (!qrData?.id || isExpired || hasExited) return;
      const res = await generateLiveQrToken(qrData.id);
      if (res.token) {
        QRCode.toDataURL(res.token, {
          width: 280,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "H",
        }).then(setQrImage);
      }
    };

    fetchToken();
    const qrInterval = setInterval(fetchToken, 30000);

    return () => clearInterval(qrInterval);
  }, [qrData, hasExited, isExpired]);

  // Auto-redirect when QR expires OR when EXIT is scanned
  useEffect(() => {
    if (isExpired || hasExited) {
      const timer = setTimeout(() => {
        router.push("/student/request");
      }, 5000); // Redirect after 5 seconds

      return () => clearTimeout(timer);
    }
  }, [isExpired, hasExited, router]);

  // Refresh page periodically to check if EXIT was scanned
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      router.refresh();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(refreshInterval);
  }, [router]);

  return (
    <>
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <BackButton href="/student" label="Back to Dashboard" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Dynamic QR Code
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            This QR code refreshes every 30 seconds. Do not screenshot.
          </p>
        </div>

        {/* QR Expired Alert */}
        {isExpired && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 mb-2">
                <AlertCircle className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-400 mb-2">
                  QR Code Expired
                </h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Your QR code has expired. Submit a new permission request to exit campus again.
                </p>
                <p className="text-xs text-zinc-500">
                  Redirecting to request form in 5 seconds...
                </p>
              </div>
              <Link href="/student/request">
                <Button className="bg-red-600 hover:bg-red-500">
                  Submit New Request
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Successfully Exited Alert - QR Now Expired */}
        {hasExited && !isExpired && (
          <Card className="border-emerald-500/50 bg-emerald-500/10">
            <CardContent className="p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 mb-2">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-400 mb-2">
                  Exit Registered Successfully
                </h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Your exit has been scanned and registered. This QR code is now expired.
                </p>
                <p className="text-xs text-zinc-500">
                  Redirecting to request form in 5 seconds...
                </p>
              </div>
              <Link href="/student/request">
                <Button className="bg-emerald-600 hover:bg-emerald-500">
                  Submit New Request
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!qrData ? (
          <EmptyState
            icon={<QrCode className="h-8 w-8" />}
            title="No Active QR Code"
            description="You don't have any approved permission requests. Submit a new request and wait for faculty/warden approval."
            action={
              <Link href="/student/request">
                <Button>Request Permission</Button>
              </Link>
            }
          />
        ) : !isExpired && (
          <Card className="overflow-hidden">
            {/* Status Header with Timer */}
            <div className="bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border-b border-zinc-800/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                  <span className="font-semibold text-zinc-200">Gate Pass</span>
                </div>
                <StatusBadge status={qrData.permission.status} />
              </div>
              {!hasExited && (
                <div className="flex items-center justify-center gap-2 mt-3 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2">
                  <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
                  <span className="text-sm font-medium text-amber-400">
                    {timeLeft}
                  </span>
                </div>
              )}
            </div>

            <CardContent className="p-4 sm:p-6 space-y-6">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="qr-container shadow-2xl animate-scale-in">
                  {qrImage ? (
                    <img
                      src={qrImage}
                      alt="Gate Pass QR Code"
                      className="w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 object-contain max-w-full"
                    />
                  ) : (
                    <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 flex items-center justify-center bg-zinc-100 rounded-lg">
                      <QrCode className="h-12 w-12 text-zinc-400 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>

              {/* Permission Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-4 py-3">
                  <FileText className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500">Purpose</p>
                    <p className="text-sm font-medium text-zinc-200">
                      {qrData.permission.purpose}
                    </p>
                  </div>
                </div>

                {qrData.permission.destination && (
                  <div className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-4 py-3">
                    <MapPin className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-500">Destination</p>
                      <p className="text-sm font-medium text-zinc-200">
                        {qrData.permission.destination}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {qrData.permission.expectedExit && (
                    <div className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-4 py-3">
                      <Clock className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-zinc-500">Exit Time</p>
                        <p className="text-sm font-medium text-zinc-200">
                          {formatDateTime(qrData.permission.expectedExit)}
                        </p>
                      </div>
                    </div>
                  )}
                  {qrData.permission.expectedReturn && (
                    <div className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-4 py-3">
                      <Clock className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-zinc-500">Return Time</p>
                        <p className="text-sm font-medium text-zinc-200">
                          {formatDateTime(qrData.permission.expectedReturn)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 rounded-lg bg-blue-500/20 p-2 text-blue-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-200">
                      Exit Instructions
                    </p>
                    <p className="text-xs text-zinc-400">
                      Show this QR code to security at the gate. Once scanned, it will expire immediately and you'll need to submit a new request for your next exit.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    
    </>
  );
}



