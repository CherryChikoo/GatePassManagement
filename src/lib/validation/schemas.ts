import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// AUTH SCHEMAS
// ──────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ──────────────────────────────────────────────────────────────
// PERMISSION SCHEMAS
// ──────────────────────────────────────────────────────────────

const timeField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a valid time, e.g. 04:00 PM`);

const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{8,16}[0-9]$/, "Enter a valid phone number (10–15 digits)");

export const permissionRequestSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(5, "Purpose must be at least 5 characters")
    .max(500, "Purpose too long"),
  destination: z.string().trim().min(2, "Destination is required").max(200),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A valid date is required"),
  expectedExit: timeField("Expected time"),
  expectedReturn: timeField("Expected return time").optional().or(z.literal("")),
  contactNumber: phoneField.optional().or(z.literal("")),
  remarks: z.string().max(500).optional().or(z.literal("")),
});

const dateField = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`);

/** Faculty Book (Form 1) request — dates only, no time fields. */
export const facultyRequestSchema = z.object({
  requestType: z.enum(["ONE_HOUR", "HALF_DAY_CL", "FULL_DAY_CL", "MULTI_DAY_CL", "OD"], {
    message: "Choose a request type",
  }),
  startDate: dateField("Start date"),
  endDate: dateField("End date").optional().or(z.literal("")),
  reason: z.string().trim().min(3, "Reason is required").max(500, "Reason too long"),
  note: z.string().trim().max(500, "Note too long").optional().or(z.literal("")),
});

/** Extra details on a hostel student's outing pass (Forms 12/13). */
export const hostelOutingSchema = z.object({
  outingDateTo: dateField("Outing date to"),
  inTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "In time must be a valid time")
    .optional()
    .or(z.literal("")),
  parentInformed: z.enum(["yes", "no"], { message: "Say whether your parent / guardian was informed" }),
  videoCallNumber: phoneField.optional().or(z.literal("")),
  guardianName: z.string().trim().max(100).optional().or(z.literal("")),
  guardianRelation: z.string().trim().max(50).optional().or(z.literal("")),
  hostelInchargeDetails: z.string().trim().max(200).optional().or(z.literal("")),
});

/** Allowed QR validity windows (minutes) an approver may choose. */
export const APPROVAL_EXPIRY_MINUTES = { MIN: 15, MAX: 720, DEFAULT: 60 } as const;

export const approvalSchema = z.object({
  permissionId: z.string().uuid(),
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
  expiryMinutes: z
    .number()
    .int()
    .min(APPROVAL_EXPIRY_MINUTES.MIN)
    .max(APPROVAL_EXPIRY_MINUTES.MAX)
    .optional(),
});

export const batchApprovalSchema = z.object({
  permissionIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one request")
    .max(5, "Maximum 5 requests can be processed at once"),
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const batchGrantSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "No students selected").max(5, "Maximum 5 students at a time"),
  type: z.enum(["ENTRY", "EXIT"]),
  purpose: z.string().trim().min(3, "Purpose is required").max(500),
  destination: z.string().trim().max(200).optional().or(z.literal("")),
  contactNumber: phoneField.optional().or(z.literal("")),
  remarks: z.string().max(500).optional().or(z.literal("")),
});

// ──────────────────────────────────────────────────────────────
// USER MANAGEMENT SCHEMAS
// ──────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["STUDENT", "FACULTY", "WARDEN", "SECURITY", "HEAD_SECURITY", "SECURITY_SUPERVISOR", "FACULTY_ADMIN", "DIRECTOR", "DEAN", "ADMIN"]),
  phone: z.string().optional().or(z.literal("")),
  // Student-specific
  studentRoll: z.string().optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  year: z.coerce.number().optional(),
  semester: z.coerce.number().int().min(1, "Semester must be 1–12").max(12, "Semester must be 1–12").optional(),
  section: z.string().optional().or(z.literal("")),
  studentType: z.enum(["DAY_SCHOLAR", "HOSTELLER"]).optional(),
  hostelType: z.enum(["BOYS", "LADIES"]).optional(),
  roomNumber: z.string().optional().or(z.literal("")),
  hostelBlock: z.string().optional().or(z.literal("")),
  // Faculty-specific
  designation: z.string().optional().or(z.literal("")),
  // Warden-specific
  wardenHostelBlock: z.string().optional().or(z.literal("")),
});

export const createGateSchema = z.object({
  name: z.string().min(2, "Gate name is required").max(100),
  location: z.string().max(200).optional().or(z.literal("")),
});

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

/** Fields any scoped staff member (HOD / faculty / warden) may edit on a student. */
export const staffStudentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: optionalText(20),
  year: z.coerce.number().int().min(1).max(6).optional().nullable(),
  semester: z.coerce.number().int().min(1).max(12).optional().nullable(),
  section: optionalText(10),
  roomNumber: optionalText(20),
  hostelBlock: optionalText(50),
});

/** Additional fields only an ADMIN may change. */
export const adminStudentUpdateSchema = staffStudentUpdateSchema.extend({
  email: z.string().trim().email("Invalid email").optional(),
  studentRoll: z.string().trim().min(1).max(30).optional(),
  department: optionalText(100),
  studentType: z.enum(["DAY_SCHOLAR", "HOSTELLER"]).optional(),
  hostelType: z.enum(["BOYS", "LADIES"]).optional().nullable().or(z.literal("")),
  facultyId: z.string().uuid().optional().nullable().or(z.literal("")),
  wardenId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export const adminUserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email("Invalid email").optional(),
  phone: optionalText(20),
  designation: optionalText(100),
  department: optionalText(100),
  employeeId: optionalText(50),
  hostelBlock: optionalText(50),
  gateId: z.string().uuid().optional().nullable().or(z.literal("")),
  /** Security accounts only: Head Security can take staff attendance */
  isHeadSecurity: z.boolean().optional(),
});

export const updateGateSchema = createGateSchema;

/** Visitors Book: every input is optional (at least one detail is checked in the action). */
export const outsiderSchema = z.object({
  name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: phoneField.optional().or(z.literal("")),
  category: z.string().trim().max(30).optional().or(z.literal("")),
  purpose: z.string().trim().max(500).optional().or(z.literal("")),
  visitingStudent: z.string().trim().max(100).optional().or(z.literal("")),
  gate: z.string().trim().max(100).optional().or(z.literal("")),
  vehicleNumber: z.string().trim().max(30).optional().or(z.literal("")),
  photoUrl: z.string().max(300).optional().or(z.literal("")),
  entryTime: z.string().optional().or(z.literal("")),
  // Visitors Book (Form 2)
  address: z.string().trim().max(300).optional().or(z.literal("")),
  department: z.string().trim().max(100).optional().or(z.literal("")),
  remarks: z.string().trim().max(500).optional().or(z.literal("")),
});

// ──────────────────────────────────────────────────────────────
// SECURITY SCHEMAS
// ──────────────────────────────────────────────────────────────

export const movementRegistrationSchema = z.object({
  qrToken: z.string().min(1, "QR token is required"),
  gateId: z.string().uuid("Invalid gate"),
  type: z.enum(["EXIT", "ENTRY"]),
  imagePath: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const manualRegistrationSchema = z.object({
  studentRoll: z.string().min(1, "Student ID is required"),
  gateId: z.string().uuid("Invalid gate"),
  type: z.enum(["EXIT", "ENTRY"]),
  purpose: z.string().min(5, "Purpose is required"),
  destination: z.string().optional().or(z.literal("")),
  imagePath: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

// ──────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ──────────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type PermissionRequestInput = z.infer<typeof permissionRequestSchema>;
export type ApprovalInput = z.infer<typeof approvalSchema>;
export type BatchApprovalInput = z.infer<typeof batchApprovalSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateGateInput = z.infer<typeof createGateSchema>;
export type MovementRegistrationInput = z.infer<typeof movementRegistrationSchema>;
export type ManualRegistrationInput = z.infer<typeof manualRegistrationSchema>;
