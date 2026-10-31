import type { Prisma } from "@prisma/client";

/**
 * The Security Supervisor's Requests view: today's work (created, approved or
 * rejected today) plus anything still pending. History is in Activity.
 */
export function supervisorRequestsScope(today: Date): Prisma.PermissionWhereInput {
  return {
    OR: [
      { createdAt: { gte: today } },
      { approvedAt: { gte: today } },
      { rejectedAt: { gte: today } },
      { status: "PENDING" },
    ],
  };
}

/** What a read-only request card shows (src/app/supervisor/request-card.tsx) */
export const SUPERVISOR_REQUEST_SELECT = {
  id: true, type: true, status: true, purpose: true, destination: true,
  exitDate: true, expectedExit: true, expectedReturn: true, contactNumber: true, remarks: true,
  requestType: true, endDate: true, numberOfDays: true, parentInformed: true, videoCallNumber: true,
  guardianName: true, guardianRelation: true, hostelInchargeDetails: true, wardenDetails: true,
  createdAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true,
  approverType: true, approvalMode: true, hodApprovedAt: true, deanApprovedAt: true,
  studentId: true, facultyId: true,
  student: {
    select: {
      studentRoll: true, department: true, year: true, section: true, studentType: true,
      profile: { select: { name: true, phone: true } },
    },
  },
  faculty: {
    select: {
      employeeId: true, department: true, designation: true,
      profile: { select: { name: true, phone: true, role: true } },
    },
  },
  approval: {
    select: {
      approved: true,
      approverType: true,
      faculty: { select: { profile: { select: { name: true } } } },
      warden: { select: { profile: { select: { name: true } } } },
    },
  },
  movements: {
    select: { type: true, createdAt: true, gate: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.PermissionSelect;

/** Status tabs: Approved = approved / out / back; Rejected = rejected, cancelled or expired */
export const SUPERVISOR_STATUS_WHERE: Record<"PENDING" | "APPROVED" | "REJECTED", Prisma.PermissionWhereInput> = {
  PENDING: { status: "PENDING" },
  APPROVED: { status: { in: ["APPROVED", "EXITED", "COMPLETED"] } },
  REJECTED: { status: { notIn: ["PENDING", "APPROVED", "EXITED", "COMPLETED"] } },
};
