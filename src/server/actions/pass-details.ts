"use server";

/**
 * Everything about one pass (student or faculty), for the "Permission Details"
 * popups in every login: the person, the request, who approved it and when,
 * outing details, and every gate scan with its time, gate, guard and photo.
 *
 * Who may open it:
 * - Main Admin, Dean, Director, Security Supervisor, Security: any pass
 * - HOD / Faculty / Warden: students they can access (scope rules), an HOD
 *   also their department's faculty, and anyone their own passes
 */

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { canAccessStudent, canViewProfile, getStaffScope } from "@/lib/auth/scope";
import { createSignedPhotoUrls } from "@/lib/storage/storage-admin";

const ROLE_LABEL: Record<string, string> = {
  FACULTY: "Faculty mentor",
  FACULTY_ADMIN: "HOD",
  WARDEN: "Warden",
  DEAN: "Dean",
  DIRECTOR: "Director",
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function getPassFullDetails(permissionId: string) {
  const user = await requireRole("ADMIN", "DEAN", "DIRECTOR", "SECURITY_SUPERVISOR", "SECURITY", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  if (typeof permissionId !== "string" || !permissionId) return { error: "Pass not found" };

  const p = await prisma.permission.findUnique({
    where: { id: permissionId },
    include: {
      student: {
        select: {
          id: true, profileId: true, studentRoll: true, department: true, year: true, semester: true, section: true,
          studentType: true, hostelType: true, roomNumber: true, hostelBlock: true,
          profile: { select: { name: true, email: true, phone: true } },
          faculty: { select: { profile: { select: { name: true } } } },
          warden: { select: { profile: { select: { name: true } } } },
        },
      },
      faculty: {
        select: {
          id: true, profileId: true, employeeId: true, department: true, designation: true,
          profile: { select: { name: true, email: true, phone: true } },
        },
      },
      approval: {
        select: {
          approverType: true, approved: true, reason: true, createdAt: true,
          faculty: { select: { designation: true, profile: { select: { name: true } } } },
          warden: { select: { profile: { select: { name: true } } } },
        },
      },
      qr: { select: { active: true, usedForExit: true, usedForEntry: true, expiresAt: true } },
      movements: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, type: true, createdAt: true, notes: true, imagePath: true,
          gate: { select: { name: true } },
          securityUser: { select: { employeeId: true, profile: { select: { name: true } } } },
        },
      },
    },
  });
  if (!p) return { error: "Pass not found" };

  // Scope: who may see this pass
  // These run together: the access check, the approvers' names and the gate
  // photos (all signed in one Storage request). Nothing is returned before
  // the access check passes.
  const wide = ["ADMIN", "DEAN", "DIRECTOR", "SECURITY_SUPERVISOR", "SECURITY"].includes(user.role);
  const accessCheck = (async () => {
    if (wide) return true;
    if (p.student?.profileId === user.profileId || p.faculty?.profileId === user.profileId) return true;
    const scope = await getStaffScope(user);
    if (p.student) return canAccessStudent(scope, p.student.id);
    if (p.faculty) return canViewProfile(scope, p.faculty.profileId);
    return false;
  })();
  const dualIds = p.approvalMode === "BOTH" ? [p.hodApproverId, p.deanApproverId].filter((x): x is string => !!x) : [];
  // Passes granted directly by an HOD / warden (or older passes) have no approval
  // record: the approver is the one saved on the pass itself
  const approvedState = !!p.approvedAt || ["APPROVED", "EXITED", "COMPLETED"].includes(p.status);
  const needsPassApprover = !dualIds.length && !p.approval?.approved && approvedState && !!p.approverId;
  const [allowed, dualPeople, photoUrls, passApprover] = await Promise.all([
    accessCheck,
    dualIds.length ? prisma.profile.findMany({ where: { id: { in: dualIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    createSignedPhotoUrls(p.movements.map((m) => m.imagePath).filter((x): x is string => !!x)).catch(() => new Map<string, string>()),
    !needsPassApprover
      ? Promise.resolve(null)
      : p.approverType === "WARDEN"
      ? prisma.warden.findUnique({ where: { id: p.approverId }, select: { profile: { select: { name: true } } } }).then((w) => (w ? { name: w.profile.name, designation: null } : null))
      : prisma.faculty.findUnique({ where: { id: p.approverId }, select: { designation: true, profile: { select: { name: true } } } }).then((f) => (f ? { name: f.profile.name, designation: f.designation } : null)),
  ]);
  if (!allowed) return { error: "You are not allowed to view this pass" };

  // Who approved: both people for HOD + Dean passes, else the final approver
  let approvedBy: { role: string; name: string; at: string | null }[] = [];
  if (dualIds.length) {
    const nameOf = (id: string | null) => dualPeople.find((x) => x.id === id)?.name ?? "";
    approvedBy = [
      ...(p.hodApproverId ? [{ role: "HOD", name: nameOf(p.hodApproverId), at: iso(p.hodApprovedAt) }] : []),
      ...(p.deanApproverId ? [{ role: "Dean", name: nameOf(p.deanApproverId), at: iso(p.deanApprovedAt) }] : []),
    ];
  } else if (p.approval?.approved) {
    const a = p.approval;
    const role =
      (a.approverType === "DEAN" || a.approverType === "DIRECTOR") && a.faculty?.designation
        ? a.faculty.designation
        : ROLE_LABEL[a.approverType] ?? a.approverType;
    approvedBy = [{ role, name: a.faculty?.profile.name ?? a.warden?.profile.name ?? "", at: iso(p.approvedAt ?? a.createdAt) }];
  } else if (approvedState) {
    // Approved (it was granted, or used at the gate) without an approval record
    const role =
      (p.approverType === "DEAN" || p.approverType === "DIRECTOR") && passApprover?.designation
        ? passApprover.designation
        : ROLE_LABEL[p.approverType] ?? p.approverType;
    approvedBy = [{ role, name: passApprover?.name ?? "", at: iso(p.approvedAt) }];
  }

  const movements = p.movements.map((m) => ({
    id: m.id,
    type: m.type,
    at: iso(m.createdAt),
    gate: m.gate?.name ?? null,
    guard: m.securityUser?.profile?.name ?? null,
    guardEmployeeId: m.securityUser?.employeeId ?? null,
    notes: m.notes,
    photoUrl: m.imagePath ? photoUrls.get(m.imagePath) ?? null : null,
  }));

  return {
    success: true,
    pass: {
      id: p.id,
      type: p.type,
      status: p.status,
      passKind: p.passKind,
      purpose: p.purpose,
      destination: p.destination,
      remarks: p.remarks,
      contactNumber: p.contactNumber,
      requestType: p.requestType,
      requestedAt: iso(p.createdAt),
      exitDate: iso(p.exitDate),
      endDate: iso(p.endDate),
      numberOfDays: p.numberOfDays,
      expectedExit: iso(p.expectedExit),
      expectedReturn: iso(p.expectedReturn),
      approvalMode: p.approvalMode,
      approvedAt: iso(p.approvedAt),
      rejectedAt: iso(p.rejectedAt),
      cancelledAt: iso(p.cancelledAt),
      rejectionReason: p.rejectionReason ?? (p.approval && !p.approval.approved ? p.approval.reason : null),
      approvalNote: p.approval?.approved ? p.approval.reason : null,
      approvedBy,
      // Hostel outing details
      parentInformed: p.parentInformed,
      videoCallNumber: p.videoCallNumber,
      guardianName: p.guardianName,
      guardianRelation: p.guardianRelation,
      hostelInchargeDetails: p.hostelInchargeDetails,
      wardenDetails: p.wardenDetails,
      wardenScannedAt: iso(p.wardenScannedAt),
      qr: p.qr
        ? { active: p.qr.active, usedForExit: p.qr.usedForExit, usedForEntry: p.qr.usedForEntry, expiresAt: iso(p.qr.expiresAt) }
        : null,
    },
    person: p.student
      ? {
          kind: "STUDENT" as const,
          name: p.student.profile.name,
          email: p.student.profile.email,
          phone: p.student.profile.phone,
          idCode: p.student.studentRoll,
          department: p.student.department,
          year: p.student.year,
          semester: p.student.semester,
          section: p.student.section,
          studentType: p.student.studentType,
          // Hostel details only belong to hostellers (older records may still carry them)
          hostelType: p.student.studentType === "HOSTELLER" ? p.student.hostelType : null,
          roomNumber: p.student.studentType === "HOSTELLER" ? p.student.roomNumber : null,
          hostelBlock: p.student.studentType === "HOSTELLER" ? p.student.hostelBlock : null,
          mentor: p.student.faculty?.profile.name ?? null,
          warden: p.student.studentType === "HOSTELLER" ? p.student.warden?.profile.name ?? null : null,
        }
      : p.faculty
      ? {
          kind: "FACULTY" as const,
          name: p.faculty.profile.name,
          email: p.faculty.profile.email,
          phone: p.faculty.profile.phone,
          idCode: p.faculty.employeeId,
          department: p.faculty.department,
          designation: p.faculty.designation,
        }
      : null,
    movements,
  };
}
