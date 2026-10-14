"use client";

import { useCallback, useEffect, useState } from "react";
import { QrScanner } from "@/components/scan/qr-scanner";
import { CheckCircle2, Home, Loader2, ScanLine, Search, XCircle } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { actionErrorMessage } from "@/lib/deployment";
import { formatDateTime, formatTime } from "@/lib/utils";
import { confirmHostelArrival, getHostelPassesToday, verifyHostelPass } from "@/server/actions/warden-scan";

type Verified = {
  pass: { id: string; purpose: string; expectedTime: string | null; approvedAt: string | null; approvedBy: string; validUntil: string };
  student: { name: string; phone: string | null; roll: string; department: string | null; year: number | null; semester: number | null; room: string | null; block: string | null };
};
type Row = { id: string; name: string; roll: string; room: string | null; purpose: string; approvedBy: string; approvedAt: string | null; arrivedAt: string | null };

/** Warden: scan a hostel student's QR (HOD-approved hostel pass) when they reach the hostel. */
export function WardenScanClient() {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [roll, setRoll] = useState("");
  const [lists, setLists] = useState<{ expected: Row[]; arrived: Row[] }>({ expected: [], arrived: [] });

  const loadLists = useCallback(async () => {
    try {
      setLists(await getHostelPassesToday());
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
      const res: any = await verifyHostelPass(value);
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

  async function confirm() {
    if (!verified) return;
    setBusy(true);
    setError(null);
    try {
      const res: any = await confirmHostelArrival(verified.pass.id);
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <BackButton href="/warden" label="Back to Dashboard" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Home className="h-6 w-6 text-amber-400" /> Scan Hostel Pass
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Hostel students going from college to the hostel get their pass approved by their HOD. Scan their QR when they arrive.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 space-y-4">
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
        <div className="flex flex-wrap gap-2">
          {(
            <button onClick={startCamera} disabled={busy} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-semibold text-white disabled:opacity-60">
              <ScanLine className="h-4 w-4" /> Scan QR code
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roll.trim()) verify(roll.trim());
            }}
            className="flex flex-1 min-w-[220px] gap-2"
          >
            <input
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
              aria-label="Roll number"
              placeholder="Or enter roll number"
              maxLength={30}
              className="h-11 flex-1 min-w-0 rounded-xl border border-zinc-700/50 bg-zinc-900 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
            <button type="submit" disabled={busy || !roll.trim()} className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
              <Search className="h-4 w-4" /> Check
            </button>
          </form>
        </div>
        {busy && !verified && (
          <p className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p>
        )}

        {verified && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4">
            <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Valid hostel pass — approved by {verified.pass.approvedBy}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                  <dd className="text-zinc-200 break-words">{(v as any) || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button onClick={confirm} disabled={busy} className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-60">
                <CheckCircle2 className="h-4 w-4" /> {busy ? "Saving…" : "Mark reached hostel"}
              </button>
              <button onClick={() => setVerified(null)} disabled={busy} className="h-11 px-4 rounded-xl border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(
          [
            ["On the way (approved)", lists.expected, "Approved"],
            ["Reached hostel today", lists.arrived, "Arrived"],
          ] as const
        ).map(([title, rows, kind]) => (
          <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <p className="text-sm font-semibold text-zinc-200">
              {title} <span className="text-zinc-500 font-normal">({rows.length})</span>
            </p>
            {rows.length === 0 ? (
              <p className="text-xs text-zinc-500">None</p>
            ) : (
              <ul className="divide-y divide-zinc-800/70">
                {rows.map((r) => (
                  <li key={r.id} className="py-2 text-sm">
                    <p className="text-zinc-100 font-medium">{r.name} <span className="text-zinc-500 font-normal">• {r.roll}{r.room ? ` • Room ${r.room}` : ""}</span></p>
                    <p className="text-xs text-zinc-400 truncate">
                      {r.purpose} • {kind === "Arrived" && r.arrivedAt ? `Arrived ${formatTime(r.arrivedAt)}` : `Approved by ${r.approvedBy}`}
                    </p>
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
