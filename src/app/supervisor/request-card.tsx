"use client";
import { scheduledNote } from "@/lib/pass-dates";

import { StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { Briefcase, Clock, GraduationCap, MapPin, Phone, ShieldCheck } from "lucide-react";
import { PassExtraDetails } from "@/components/passes/pass-extra";

/** Who the request was sent to, in plain words (with HOD + Dean progress for "Both"). */
export function approverText(r: any): string {
  if (r.facultyId) {
    if (r.approvalMode === "BOTH") {
      const hod = r.hodApprovedAt ? "HOD ✓" : "HOD pending";
      const dean = r.deanApprovedAt ? "Dean ✓" : "Dean pending";
      return r.status === "PENDING" ? `HOD + Dean (${hod}, ${dean})` : "HOD + Dean";
    }
    if (r.approverType === "DEAN") return "Dean";
    if (r.approverType === "FACULTY_ADMIN") return "HOD";
    if (r.approverType === "DIRECTOR") return "Director";
    return r.approverType || "—";
  }
  if (r.approverType === "WARDEN") return "Hostel Warden";
  if (r.approverType === "FACULTY_ADMIN") return "HOD";
  if (r.approverType === "FACULTY") return "Faculty";
  return r.approverType || "—";
}

export function statusGroup(status: string): "PENDING" | "APPROVED" | "REJECTED" {
  if (status === "PENDING") return "PENDING";
  if (["APPROVED", "EXITED", "COMPLETED"].includes(status)) return "APPROVED";
  return "REJECTED";
}

/** Read-only request card: the supervisor can view but never approve or reject. */
export function RequestCard({ r, compact = false }: { r: any; compact?: boolean }) {
  const isFaculty = !!r.facultyId;
  const person = isFaculty ? r.faculty : r.student;
  const name = person?.profile?.name ?? "Unknown";
  const idLabel = isFaculty ? person?.employeeId || "Faculty" : person?.studentRoll;
  const roleLabel = isFaculty
    ? person?.profile?.role === "FACULTY_ADMIN"
      ? "HOD"
      : "Faculty"
    : person?.studentType === "HOSTELLER"
    ? "Hosteller"
    : "Day Scholar";
  const decidedBy = r.approval?.faculty?.profile?.name || r.approval?.warden?.profile?.name;

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            isFaculty ? "bg-orange-500/10 text-orange-400" : "bg-zinc-950 text-zinc-400"
          }`}
          aria-hidden="true"
        >
          {isFaculty ? <Briefcase className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100 break-words">
            {name}
            {idLabel && <span className="font-mono text-xs font-normal text-zinc-500"> · {idLabel}</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{roleLabel}</span>
            {person?.department && (
              <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 max-w-full truncate">
                {person.department}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                r.type === "ENTRY" ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"
              }`}
            >
              {r.type}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge status={r.status} />
        </div>
      </div>

      <p className="text-sm text-zinc-200 break-words">{r.purpose}</p>

      <PassExtraDetails pass={r} />

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        {r.destination && (
          <span className="flex items-center gap-1.5 min-w-0 break-words">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {r.destination}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Requested {formatDateTime(r.createdAt)}{scheduledNote(r)}
        </span>
        {r.expectedExit && <span>Expected {formatDateTime(r.expectedExit)}</span>}
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Approver: {approverText(r)}
        </span>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-zinc-800/70 pt-3 text-xs empty:hidden">
          {(r.contactNumber || person?.profile?.phone) && (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {r.contactNumber || person?.profile?.phone}
            </span>
          )}
          {r.approvedAt && (
            <span className="text-emerald-400">
              Approved {formatDateTime(r.approvedAt)}
              {decidedBy ? ` by ${decidedBy}` : ""}
            </span>
          )}
          {r.rejectedAt && (
            <span className="text-red-400 break-words">
              Rejected {formatDateTime(r.rejectedAt)}
              {decidedBy ? ` by ${decidedBy}` : ""}
              {r.rejectionReason ? ` — ${r.rejectionReason}` : ""}
            </span>
          )}
          {r.movements?.map((m: any, i: number) => (
            <span key={i} className="text-zinc-500">
              {m.type === "EXIT" ? "Exited" : "Entered"} {formatDateTime(m.createdAt)}
              {m.gate?.name ? ` • ${m.gate.name}` : ""}
            </span>
          ))}
          {r.remarks && <span className="text-zinc-500 break-words">Remarks: {r.remarks}</span>}
        </div>
      )}
    </div>
  );
}
