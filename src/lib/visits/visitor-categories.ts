/**
 * Visitors Book: what each category asks for. Shared by Security's form ("Type
 * it myself"), the visitor's own phone form (QR) and the server checks, so all
 * three always agree.
 *
 * Every category: photo (Security), full name, phone, address, and a purpose OR
 * a person to visit; vehicle number or "on foot"; remarks optional.
 * Parent / Guardian: found by the student's roll number; the parent's name,
 * phone, address and usual vehicle come from the student's record.
 */

export const VISITOR_CATEGORY_KEYS = ["GUEST", "PARENT", "VENDOR", "WORKER"] as const;
export type VisitorCategory = (typeof VISITOR_CATEGORY_KEYS)[number];

export type CategoryRule = {
  key: VisitorCategory;
  label: string;
  /** Purpose filled in when the category is picked (can be changed) */
  defaultPurpose: string;
  /** Found by the student's roll number (parents) */
  byStudentRoll: boolean;
  /** Short hint under the dropdown */
  hint: string;
};

export const VISITOR_CATEGORY_RULES: Record<VisitorCategory, CategoryRule> = {
  GUEST: { key: "GUEST", label: "Guest / Visitor", defaultPurpose: "", byStudentRoll: false, hint: "Anyone coming to meet someone or for other work" },
  PARENT: { key: "PARENT", label: "Parent / Guardian", defaultPurpose: "Parent Visit", byStudentRoll: true, hint: "Find the student by roll number" },
  VENDOR: { key: "VENDOR", label: "Vendor / Delivery", defaultPurpose: "Delivery", byStudentRoll: false, hint: "Bringing goods or a parcel" },
  WORKER: { key: "WORKER", label: "Worker / Staff", defaultPurpose: "Maintenance / Repair", byStudentRoll: false, hint: "Repair, maintenance or other work" },
};

export function isVisitorCategory(v: unknown): v is VisitorCategory {
  return typeof v === "string" && (VISITOR_CATEGORY_KEYS as readonly string[]).includes(v);
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

// ─── "Coming for": the one choice the simple form asks ───────────────────────
// Full name, phone, address / company, vehicle (or on foot), then "Coming for",
// which shows only the one extra box it needs. Saved into the Visitors Book's
// own fields (category, purpose, person to visit, meeting host).

export const COMING_FOR_KEYS = ["MEETING", "PARENT", "DELIVERY", "OTHER"] as const;
export type ComingFor = (typeof COMING_FOR_KEYS)[number];

export const COMING_FOR: Record<ComingFor, { label: string; detailLabel: string }> = {
  MEETING: { label: "Meeting a faculty member", detailLabel: "Select faculty" },
  PARENT: { label: "Parent visit", detailLabel: "Student roll number" },
  DELIVERY: { label: "Delivery", detailLabel: "Delivering to / what" },
  OTHER: { label: "Other work", detailLabel: "Type the work" },
};

export function isComingFor(v: unknown): v is ComingFor {
  return typeof v === "string" && (COMING_FOR_KEYS as readonly string[]).includes(v);
}

/**
 * The Visitors Book fields for a "Coming for" choice. `detail` is the typed text
 * (Delivery / Other work); `host` the faculty picked (Meeting); `student` the
 * student found (Parent visit: "<name> (<ROLL>)").
 */
export function comingForFields(
  comingFor: ComingFor,
  opts: { detail?: string; hostProfileId?: string; student?: string }
): { category: VisitorCategory; purpose: string; visitingStudent: string; hostProfileId: string } {
  const detail = (opts.detail ?? "").trim();
  switch (comingFor) {
    case "MEETING":
      return { category: "GUEST", purpose: "Meeting", visitingStudent: "", hostProfileId: opts.hostProfileId ?? "" };
    case "PARENT":
      return { category: "PARENT", purpose: "Parent Visit", visitingStudent: opts.student ?? "", hostProfileId: "" };
    case "DELIVERY":
      return { category: "VENDOR", purpose: detail ? `Delivery: ${detail}` : "Delivery", visitingStudent: "", hostProfileId: "" };
    default:
      return { category: "GUEST", purpose: detail, visitingStudent: "", hostProfileId: "" };
  }
}

/** What is still missing in the simple form (English, translated on screen), or null. */
export function missingComingForDetail(
  comingFor: unknown,
  opts: { detail?: string; hostProfileId?: string; student?: string }
): string | null {
  if (!isComingFor(comingFor)) return "Choose what they are coming for";
  if (comingFor === "MEETING" && !filled(opts.hostProfileId)) return "Select the faculty member";
  if (comingFor === "PARENT" && !filled(opts.student)) return "Find the student by roll number";
  if (comingFor === "OTHER" && !filled(opts.detail)) return "Type the work";
  return null;
}

/**
 * The first missing required detail (an English sentence, translated on
 * screen), or null when the visitor's details are complete. Photo and vehicle
 * are checked where they are taken.
 */
export function missingVisitorDetail(f: {
  category?: unknown;
  name?: unknown;
  phone?: unknown;
  address?: unknown;
  purpose?: unknown;
  visitingStudent?: unknown;
  hostProfileId?: unknown;
}): string | null {
  if (!isVisitorCategory(f.category)) return "Choose the category";
  if (!filled(f.name)) return "Enter the full name";
  if (!filled(f.phone)) return "Enter the phone number";
  if (!filled(f.address)) return "Enter the address";
  if (!filled(f.purpose) && !filled(f.visitingStudent) && !filled(f.hostProfileId)) {
    return "Enter the purpose of the visit or the person to visit";
  }
  return null;
}
