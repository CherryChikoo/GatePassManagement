/**
 * A student's parents / guardian, kept on the student account so that when
 * one of them comes to the gate, Security picks the student and the Visitors
 * Book form fills itself (name, mobile, address, vehicle). The photo is still
 * taken at every visit.
 *
 * Shared by the forms (browser) and the server checks.
 */

export const PARENT_FIELDS = [
  "fatherName",
  "fatherPhone",
  "motherName",
  "motherPhone",
  "guardianName",
  "guardianRelation",
  "guardianPhone",
  "homeAddress",
  "parentVehicle",
] as const;

export type ParentField = (typeof PARENT_FIELDS)[number];

/** Database select for the parent details (Prisma) */
export const PARENT_SELECT = {
  fatherName: true,
  fatherPhone: true,
  motherName: true,
  motherPhone: true,
  guardianName: true,
  guardianRelation: true,
  guardianPhone: true,
  homeAddress: true,
  parentVehicle: true,
} as const satisfies Record<ParentField, true>;
export type ParentDetails = Partial<Record<ParentField, string | null>>;

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/**
 * Problem with the parent details, or null when they are fine.
 * - A name needs its mobile and a mobile its name (else the Visitors form
 *   cannot be filled from it).
 * - `complete` (new students): the father or the mother with both name and
 *   mobile, and the home address.
 */
export function parentDetailsProblem(p: ParentDetails, complete: boolean): string | null {
  const pairs: [string, ParentField, ParentField][] = [
    ["father", "fatherName", "fatherPhone"],
    ["mother", "motherName", "motherPhone"],
    ["guardian", "guardianName", "guardianPhone"],
  ];
  for (const [who, name, phone] of pairs) {
    if (filled(p[name]) && !filled(p[phone])) return `Enter the ${who}'s mobile number too`;
    if (filled(p[phone]) && !filled(p[name])) return `Enter the ${who}'s name too`;
  }
  if (filled(p.guardianName) && !filled(p.guardianRelation)) return "Enter how the guardian is related (e.g. Uncle)";
  if (complete) {
    if (!filled(p.fatherName) && !filled(p.motherName)) return "Enter the father's or mother's name and mobile number";
    if (!filled(p.homeAddress)) return "Enter the home address";
  }
  return null;
}

/** Trimmed values for saving: empty boxes become null */
export function cleanParentDetails(p: ParentDetails): Record<ParentField, string | null> {
  const out = {} as Record<ParentField, string | null>;
  for (const k of PARENT_FIELDS) {
    const v = p[k]?.trim();
    out[k] = v ? (k === "parentVehicle" ? v.toUpperCase() : v) : null;
  }
  return out;
}
