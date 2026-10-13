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

export const permissionRequestSchema = z.object({
  purpose: z
    .string()
    .min(5, "Purpose must be at least 5 characters")
    .max(500, "Purpose too long"),
  destination: z.string().min(2, "Destination is required").max(200),
  exitDate: z.string().min(1, "Exit date is required"),
  expectedExit: z.string().min(1, "Expected exit time is required"),
  expectedReturn: z.string().optional().or(z.literal("")),
  contactNumber: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15)
    .optional()
    .or(z.literal("")),
  remarks: z.string().max(500).optional().or(z.literal("")),
});

export const approvalSchema = z.object({
  permissionId: z.string().uuid(),
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export const batchApprovalSchema = z.object({
  permissionIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one request")
    .max(5, "Maximum 5 students can be approved at once"),
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional().or(z.literal("")),
});

// ──────────────────────────────────────────────────────────────
// USER MANAGEMENT SCHEMAS
// ──────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["STUDENT", "FACULTY", "WARDEN", "SECURITY", "FACULTY_ADMIN", "DIRECTOR", "DEAN", "ADMIN"]),
  phone: z.string().optional().or(z.literal("")),
  // Student-specific
  studentRoll: z.string().optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  year: z.coerce.number().optional(),
  section: z.string().optional().or(z.literal("")),
  studentType: z.enum(["DAY_SCHOLAR", "HOSTELLER"]).optional(),
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
