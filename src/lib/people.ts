/**
 * Gate movements belong to a student or a faculty member. Many screens read the
 * person from `movement.student`; for faculty movements that is empty, which
 * showed up as "Unknown". This fills it from the faculty member (name, employee
 * ID as the ID, department, designation) and marks it with `isFaculty`.
 *
 * Only gate-movement records (they have `gate` / `securityUser`) are touched;
 * pass requests are left as they are, so student and faculty passes are never
 * mixed up.
 */
type AnyRecord = Record<string, any>;

export function facultyAsPerson(faculty: AnyRecord) {
  return {
    isFaculty: true,
    studentRoll: faculty.employeeId || "Faculty",
    department: faculty.department ?? null,
    designation: faculty.designation ?? null,
    profile: faculty.profile,
  };
}

function isMovement(o: AnyRecord): boolean {
  return ("gate" in o || "securityUser" in o || "gateId" in o) && (o.type === "EXIT" || o.type === "ENTRY");
}

/** Walks a result (arrays / objects) and fills `student` for faculty gate movements. Mutates in place. */
export function fillMovementPeople<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (const item of value) fillMovementPeople(item, depth + 1);
    return value;
  }
  const o = value as AnyRecord;
  if (o.student == null && o.faculty?.profile && isMovement(o)) {
    o.student = facultyAsPerson(o.faculty);
  }
  for (const key of Object.keys(o)) {
    const v = o[key];
    if (v && typeof v === "object" && !(v instanceof Date)) fillMovementPeople(v, depth + 1);
  }
  return value;
}
