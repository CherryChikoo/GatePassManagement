"use client";

import { useCallback, useEffect, useState } from "react";
import { QrScanner } from "@/components/scan/qr-scanner";
import { CheckCircle2, Home, Loader2, ScanLine, Search, XCircle } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/deployment";
import { formatDateTime, formatTime } from "@/lib/utils";
import { callGate } from "@/lib/gate-call";

type Verified = {
  pass: { id: string; purpose: string; expectedTime: string | null; approvedAt: string | null; approvedBy: string; validUntil: string };
  student: { name: string; phone: string | null; roll: string; department: string | null; year: number | null; semester: number | null; room: string | null; block: string | null };
};
type Row = { id: string; name: string; roll: string; room: string | null; purpose: string; approvedBy: string; approvedAt: string | null; arrivedAt: string | null };

/** Warden: scan a hostel student's QR (HOD-approved hostel pass) when they reach the hostel. */
export function WardenScanClient({ autoStart = false }: { autoStart?: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [roll, setRoll] = useState("");
  const [lists, setLists] = useState<{ expected: Row[]; arrived: Row[] }>({ expected: [], arrived: [] });

  const loadLists = useCallback(async () => {
    try {
      setLists((await callGate("getHostelPassesToday", [], 15_000)) as any);
    } catch {
      /* the list is a convenience; scanning still works */
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setVerified(null);
    try {
      const res: any = await callGate("verifyHostelPass", [value], 15_000);
      if (!res.valid) setError(res.error || "Invalid pass");
      else setVerified({ pass: res.pass, student: res.student });
    } catch (err) {
      setError(actionErrorMessage(err, "Could not check the pass."));
    }
    setBusy(false);
  }

  function startCamera() {
    setError(null);
    setNotice(null);
    setVerified(null);
    setScanning(true);
  }

  // Opened from a "Scan" button: start the camera right away, then drop ?scan=1
  // from the address so a refresh doesn't reopen it.
  useEffect(() => {
    if (!autoStart) return;
    setScanning(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, [autoStart]);

  async function confirm() {
    if (!verified) return;
    setBusy(true);
    setError(null);
    try {
      const res: any = await callGate("confirmHostelArrival", [verified.pass.id], 20_000);
      if (res?.error) setError(res.error);
      else {
        setNotice(`${verified.student.name} marked as reached the hostel.`);
        setVerified(null);
        setRoll("");
        await loadLists();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not record the arrival."));
    }
    setBusy(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8">
      <div className="min-w-0">
        <BackButton href="/warden" label="Back to Dashboard" className="-ml-3 mb-2" />
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
            <Home className="h-5 w-5" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Scan Hostel Pass</h1>
        </div>
        <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
          Hostel students going from college to the hostel get their pass approved by their HOD. Scan their QR when they arrive.
        </p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card p-5 sm:p-6 space-y-5">
        {scanning && (
          <QrScanner
            title="Scan hostel pass"
            onResult={(text) => {
              setScanning(false);
              verify(text);
            }}
            onCancel={() => setScanning(false)}
          />
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {(
            <Button onClick={startCamera} disabled={busy} className="h-12 w-full sm:w-auto px-6">
              <ScanLine className="h-4 w-4" /> Scan QR code
            </Button>
          )}
          <div className="flex items-center gap-3 sm:hidden" aria-hidden="true">
            <span className="h-px flex-1 bg-zinc-800" />
            <span className="text-[11px] uppercase tracking-wider text-zinc-500">or</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roll.trim()) verify(roll.trim());
            }}
            className="flex flex-1 min-w-0 gap-2"
          >
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                aria-label="Roll number"
                placeholder="Or enter roll number"
                maxLength={30}
                className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy || !roll.trim()} className="h-12 shrink-0">
              Check
            </Button>
          </form>
        </div>
        {busy && !verified && (
          <p className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p>
        )}

        {verified && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 space-y-4">
            <p className="text-sm font-medium text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> Valid hostel pass — approved by {verified.pass.approvedBy}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["Student", verified.student.name],
                ["Roll Number", verified.student.roll],
                ["Branch", verified.student.department],
                ["Year & Semester", [verified.student.year && `Year ${verified.student.year}`, verified.student.semester && `Sem ${verified.student.semester}`].filter(Boolean).join(" • ")],
                ["Room", [verified.student.room, verified.student.block && `Block ${verified.student.block}`].filter(Boolean).join(" • ")],
                ["Phone", verified.student.phone],
                ["Purpose", verified.pass.purpose],
                ["Expected time", verified.pass.expectedTime ? formatTime(verified.pass.expectedTime) : null],
                ["Approved", verified.pass.approvedAt ? formatDateTime(verified.pass.approvedAt) : null],
                ["Valid until", formatDateTime(verified.pass.validUntil)],
              ].map(([k, v]) => (
                <div key={k as string} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{(v as any) || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="success" onClick={confirm} disabled={busy} className="h-12 w-full sm:w-auto px-6">
                <CheckCircle2 className="h-4 w-4" /> {busy ? "Saving…" : "Mark reached hostel"}
              </Button>
              <Button variant="outline" onClick={() => setVerified(null)} disabled={busy} className="h-12 w-full sm:w-auto">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        {(
          [
            ["On the way (approved)", lists.expected, "Approved"],
            ["Reached hostel today", lists.arrived, "Arrived"],
          ] as const
        ).map(([title, rows, kind]) => (
          <div key={title} className="min-w-0 rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-zinc-100">{title}</h2>
              <span className="rounded-full bg-zinc-950 border border-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                {rows.length}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">None</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-800/70">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-semibold text-sm ${
                        kind === "Arrived" ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400"
                      }`}
                    >
                      {(r.name || "S").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {r.name} <span className="text-zinc-500 font-normal">· {r.roll}{r.room ? ` · Room ${r.room}` : ""}</span>
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {r.purpose} · {kind === "Arrived" && r.arrivedAt ? `Arrived ${formatTime(r.arrivedAt)}` : `Approved by ${r.approvedBy}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
