"use client";
import { scheduledNote } from "@/lib/pass-dates";

import { StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { Briefcase, Clock, GraduationCap, MapPin, Phone, ShieldCheck } from "lucide-react";

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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
            isFaculty ? "bg-indigo-500/15 text-indigo-300" : "bg-orange-500/15 text-orange-300"
          }`}
          aria-hidden="true"
        >
          {isFaculty ? <Briefcase className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
        </span>
        <span className="text-sm font-semibold text-zinc-100">{name}</span>
        {idLabel && (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{idLabel}</span>
        )}
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{roleLabel}</span>
        {person?.department && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{person.department}</span>
        )}
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            r.type === "ENTRY" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
          }`}
        >
          {r.type}
        </span>
        <StatusBadge status={r.status} />
      </div>

      <p className="text-sm text-zinc-200 break-words">{r.purpose}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        {r.destination && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {r.destination}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Requested {formatDateTime(r.createdAt)}{scheduledNote(r)}
        </span>
        {r.expectedExit && <span>Expected {formatDateTime(r.expectedExit)}</span>}
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Approver: {approverText(r)}
        </span>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(r.contactNumber || person?.profile?.phone) && (
            <span className="flex items-center gap-1 text-zinc-400">
              <Phone className="h-3 w-3" aria-hidden="true" />
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
            <span className="text-red-400">
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
          {r.remarks && <span className="text-zinc-500">Remarks: {r.remarks}</span>}
        </div>
      )}
    </div>
  );
}
