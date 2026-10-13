"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea, Select } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { createPermissionRequest } from "@/server/actions/permissions";
import {
  MapPin,
  Calendar,
  Clock,
  Phone,
  FileText,
  Send,
  CheckCircle2,
  ArrowLeft,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";

interface Props {
  user: { name: string; email: string; role: string };
  approvers: any[];
  isHosteller: boolean;
}

export function RequestFormClient({ user, approvers, isHosteller }: Props) {
  const approverLabel = isHosteller ? "Warden" : "Faculty Advisor";
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [today, setToday] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setToday(`${year}-${month}-${day}`);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  function parse12HourTime(timeStr: string): string {
    if (!timeStr) return timeStr;
    const match = timeStr.trim().match(/^(1[0-2]|0?[1-9]):([0-5][0-9])\s*(AM|PM)$/i);
    if (!match) return timeStr;
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${m}`;
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    // Parse 12-hour typed times to 24-hour HH:mm
    const rawExit = formData.get("expectedExit") as string;
    if (rawExit) formData.set("expectedExit", parse12HourTime(rawExit));
    const rawReturn = formData.get("expectedReturn") as string;
    if (rawReturn) formData.set("expectedReturn", parse12HourTime(rawReturn));

    try {
      const result = await createPermissionRequest(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
              Your permission request has been sent for approval. Once approved, you will receive a unique QR code with a time limit to exit campus.
            </p>
            <div className="flex gap-3 justify-center">
              <BackButton href="/student/history" label="View History" />
            </div>
          </div>
        </div>
      
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            New Permission Request
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Choose request type and fill in the details below.
          </p>
        </div>

        {/* Toggle between EXIT and ENTRY */}
        <div className="flex gap-2 sm:gap-3">
          <Link 
            href="/student/request"
            className="flex-1 rounded-xl border-2 border-orange-500 bg-orange-500/10 px-3 sm:px-6 py-3 sm:py-4 hover:bg-orange-500/20 transition-colors min-w-0"
          >
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-orange-400 text-xs sm:text-sm">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="font-semibold truncate">EXIT Pass</span>
            </div>
            <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-1 truncate">Leave campus</p>
          </Link>
          
          <Link 
            href="/student/entry"
            className="flex-1 rounded-xl border-2 border-zinc-700 bg-zinc-800/30 px-3 sm:px-6 py-3 sm:py-4 hover:bg-zinc-800/50 transition-colors min-w-0"
          >
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-zinc-400 text-xs sm:text-sm">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="font-semibold truncate">ENTRY Pass</span>
            </div>
            <p className="text-[10px] sm:text-xs text-zinc-500 text-center mt-1 truncate">Enter campus</p>
          </Link>
        </div>

        <Card>
          <CardContent className="p-6">
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-fade-in">
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-6">
              {/* Approver Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Select {approverLabel} *
                </label>
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <select
                    name="approverId"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none cursor-pointer"
                  >
                    <option value="">-- Choose {approverLabel} --</option>
                    {approvers.map((approver) => (
                      <option key={approver.id} value={approver.id}>
                        {approver.profile?.name || "Unknown"} 
                        {approver.department && ` - ${approver.department}`}
                        {approver.hostelBlock && ` - ${approver.hostelBlock}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Purpose of Exit *
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    name="purpose"
                    placeholder="e.g., Medical appointment, Family event"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Destination *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    name="destination"
                    placeholder="e.g., Home, Hospital, City"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Exit Date and Time - Side by Side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Exit Date */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Exit Date *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <input
                      type="date"
                      name="exitDate"
                      value={today}
                      readOnly
                      required
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-lg text-zinc-100 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                </div>

                {/* Expected Exit Time */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Expected Exit Time *
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      name="expectedExit"
                      list="time-options-12h"
                      placeholder="--:--"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <datalist id="time-options-12h">
                      {Array.from({ length: 48 }, (_, i) => {
                        const hour24 = Math.floor(i / 2);
                        const minute = i % 2 === 0 ? '00' : '30';
                        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                        const ampm = hour24 < 12 ? 'AM' : 'PM';
                        const timeStr = `${String(hour12).padStart(2, '0')}:${minute} ${ampm}`;
                        return <option key={i} value={timeStr} />;
                      })}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Contact Number */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Contact Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="tel"
                    name="contactNumber"
                    maxLength={10}
                    placeholder="Phone number while outside"
                    className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Additional Remarks */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Additional Remarks
                </label>
                <textarea
                  name="remarks"
                  rows={3}
                  placeholder="Any additional information for the approver..."
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  "Submitting..."
                ) : (
                  <>
                    Submit Exit Request
                    <Send className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    
    </>
  );
}
