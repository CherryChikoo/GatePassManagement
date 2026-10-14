/**
 * Application-wide constants
 * Centralizes magic numbers and configuration values
 */

// ============================================================
// TIME CONSTANTS
// ============================================================

export const TIME = {
  ONE_SECOND_MS: 1000,
  ONE_MINUTE_MS: 60 * 1000,
  ONE_HOUR_MS: 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH_MS: 30 * 24 * 60 * 60 * 1000,
  
  ONE_DAY_SECONDS: 86400,
  ONE_HOUR_SECONDS: 3600,
  ONE_MINUTE_SECONDS: 60,
} as const;

// ============================================================
// CACHE TTLs (Time To Live in milliseconds)
// ============================================================

export const CACHE_TTL = {
  PROFILE: 20_000, // 20 seconds
  DASHBOARD: 15_000, // 15 seconds
  OUTSIDERS: 15_000,
  FACULTY_LIST: 30_000, // 30 seconds
  WARDEN_LIST: 30_000,
  GATES_LIST: 30_000,
  USER_DETAILS: 30_000,
  FORM_DATA: 30_000,
  STUDENT_DASHBOARD: 15_000,
} as const;

// ============================================================
// LIMITS & QUOTAS
// ============================================================

export const LIMITS = {
  // File uploads
  MAX_IMAGE_SIZE_BYTES: 700_000, // ~700KB (base64 encoded)
  MAX_IMAGE_SIZE_KB: 500,
  MAX_IMAGE_WIDTH: 4096,
  MAX_IMAGE_HEIGHT: 4096,
  
  // Batch operations
  MAX_BATCH_APPROVALS: 5,
  MAX_BATCH_PERMISSIONS: 5,
  
  // Database queries
  MAX_QUERY_RESULTS: 1000,
  DEFAULT_PAGE_SIZE: 20,
  
  // Text fields
  MAX_PURPOSE_LENGTH: 500,
  MAX_DESTINATION_LENGTH: 200,
  MAX_NOTES_LENGTH: 500,
  MAX_REASON_LENGTH: 500,
  MAX_NAME_LENGTH: 100,
  
  // Rate limiting
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  LOGIN_BLOCK_DURATION_MS: 30 * 60 * 1000, // 30 minutes
} as const;

// ============================================================
// DATA RETENTION (for cron cleanup job)
// ============================================================

export const RETENTION = {
  COMPLETED_PERMISSIONS_MONTHS: 6,
  OLD_MOVEMENTS_YEARS: 1,
  EXPIRED_QR_CODES_DAYS: 30,
  /** Visitor (outsider) photos only; student gate photos are kept permanently */
  EXIT_PHOTOS_DAYS: 90,
} as const;

// ============================================================
// STORAGE
// ============================================================

export const STORAGE = {
  BUCKET_NAME: "gatepass-photos",
  EXITS_FOLDER: "exits",
  OUTSIDERS_FOLDER: "outsiders",
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
} as const;

// ============================================================
// VALIDATION PATTERNS
// ============================================================

export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[0-9]{10,15}$/,
  STUDENT_ROLL: /^[A-Z0-9]{4,20}$/i,
} as const;

// ============================================================
// UI CONSTANTS
// ============================================================

export const UI = {
  TOAST_DURATION_MS: 4000,
  DEBOUNCE_SEARCH_MS: 300,
  MODAL_ANIMATION_MS: 200,
} as const;

// ============================================================
// ACADEMIC DEPARTMENTS
// ============================================================

export interface DepartmentOption {
  code: string;
  name: string;
  aliases: string[];
}

export const DEPARTMENTS: readonly DepartmentOption[] = [
  { code: "CSE", name: "Computer Science & Engineering", aliases: ["Computer Science", "CSE", "CS", "Comp Sci"] },
  { code: "ECE", name: "Electronics & Communication Engineering", aliases: ["Electronics", "ECE", "EC", "Electronics and Communication"] },
  { code: "EEE", name: "Electrical & Electronics Engineering", aliases: ["EEE", "Electrical", "EE", "Electrical and Electronics"] },
  { code: "MECH", name: "Mechanical Engineering", aliases: ["Mechanical", "MECH", "ME"] },
  { code: "CIVIL", name: "Civil Engineering", aliases: ["Civil", "CIVIL", "CE"] },
  { code: "IT", name: "Information Technology", aliases: ["IT", "Info Tech"] },
  { code: "AIDS", name: "Artificial Intelligence & Data Science", aliases: ["AI&DS", "AIDS", "AI/DS", "AI & DS", "Data Science"] },
  { code: "AIML", name: "Artificial Intelligence & Machine Learning", aliases: ["AI&ML", "AIML", "AI/ML", "AI & ML"] },
  { code: "CHEM", name: "Chemical Engineering", aliases: ["Chemical", "CHEM", "CH"] },
  { code: "AERO", name: "Aeronautical Engineering", aliases: ["Aeronautical", "Aerospace", "AERO"] },
] as const;

/**
 * Given any department string (code, full name, or alias), returns an array
 * of all equivalent variants so Prisma queries match regardless of format.
 */
export function getDepartmentVariants(dept?: string | null): string[] {
  if (!dept || !dept.trim()) return [];
  const trimmed = dept.trim();
  const lower = trimmed.toLowerCase();

  const found = DEPARTMENTS.find(
    (d) =>
      d.code.toLowerCase() === lower ||
      d.name.toLowerCase() === lower ||
      d.aliases.some((a) => a.toLowerCase() === lower)
  );

  if (!found) {
    return [trimmed];
  }

  const set = new Set<string>([trimmed, found.code, found.name, ...found.aliases]);
  return Array.from(set);
}

/**
 * Returns the short department code (e.g. "CSE", "ECE").
 */
export function getDepartmentCode(dept?: string | null): string {
  if (!dept || !dept.trim()) return "";
  const trimmed = dept.trim();
  const lower = trimmed.toLowerCase();
  const found = DEPARTMENTS.find(
    (d) =>
      d.code.toLowerCase() === lower ||
      d.name.toLowerCase() === lower ||
      d.aliases.some((a) => a.toLowerCase() === lower)
  );
  return found ? found.code : trimmed;
}

/**
 * Returns the formal full name of a department.
 */
export function getDepartmentFullName(dept?: string | null): string {
  if (!dept || !dept.trim()) return "";
  const trimmed = dept.trim();
  const lower = trimmed.toLowerCase();
  const found = DEPARTMENTS.find(
    (d) =>
      d.code.toLowerCase() === lower ||
      d.name.toLowerCase() === lower ||
      d.aliases.some((a) => a.toLowerCase() === lower)
  );
  return found ? found.name : trimmed;
}

