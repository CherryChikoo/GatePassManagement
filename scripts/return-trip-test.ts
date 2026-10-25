/**
 * Exit / return rules at the gate (no database):
 *   npx tsx scripts/return-trip-test.ts
 *
 * - Day scholars: the exit pass ends at the exit (coming back = a new Entry pass).
 * - Hostellers going out and faculty: the same QR is scanned again to come back,
 *   however late — a late return is only marked "Delayed return".
 * - Hostel passes (college → hostel) are one-way.
 * - The exit QR follows the planned exit time.
 */
import { canScanReturn, delayMinutes, exitQrExpiresAt, formatDelay, returnDueAt } from "../src/lib/passes/return-scan";
import { istDayRange, istDateTime, istDateToInstant } from "../src/lib/time/ist";

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const H = 60 * 60_000;
const out = { status: "EXITED", type: "EXIT", passKind: null, qr: { usedForExit: true, usedForEntry: false } };

// ── Who comes back on the same QR ──
expect("hosteller out on an outing -> return on the same QR",
  canScanReturn({ ...out, studentId: "s1", facultyId: null, approverType: "WARDEN" }, false));
expect("faculty out on leave -> return on the same QR",
  canScanReturn({ ...out, studentId: null, facultyId: "f1" }, false));
expect("day scholar -> no return on the exit pass (new Entry request)",
  !canScanReturn({ ...out, studentId: "s2", facultyId: null, approverType: "FACULTY_ADMIN" }, false));
expect("day scholar's pass stays one-way after the student is made a hosteller",
  !canScanReturn({ ...out, studentId: "s2", facultyId: null, approverType: "FACULTY_ADMIN" }, false));
expect("an outing still needs its return after the student is made a day scholar",
  canScanReturn({ ...out, studentId: "s1", facultyId: null, approverType: "WARDEN" }, false));
expect("hostel pass (college -> hostel) is one-way",
  !canScanReturn({ ...out, passKind: "HOSTEL", studentId: "s1", facultyId: null, approverType: "FACULTY_ADMIN" }, false));
expect("return already recorded -> no second return",
  !canScanReturn({ ...out, studentId: null, facultyId: "f1" }, true));
expect("not yet out (approved) -> no return",
  !canScanReturn({ ...out, status: "APPROVED", qr: { usedForExit: false, usedForEntry: false }, studentId: null, facultyId: "f1" }, false));

// ── When they are due back ──
const outingReturn = istDateTime("2026-11-02", "19:30")!;
expect("outing: due at the planned in-time", returnDueAt({ expectedReturn: outingReturn })?.getTime() === outingReturn.getTime());
const leaveEnd = istDateToInstant("2026-11-05");
const dueLeave = returnDueAt({ endDate: leaveEnd, exitDate: istDateToInstant("2026-11-02") })!;
expect("multi-day leave: due by the end of its last day", dueLeave.getTime() === istDayRange(leaveEnd).end.getTime());
expect("no dates -> no planned return", returnDueAt({}) === null);

// ── Late returns are allowed and measured ──
expect("on time -> 0 min late", delayMinutes(dueLeave, new Date(dueLeave.getTime() - H)) === 0);
expect("a day late -> 1440 min", delayMinutes(dueLeave, new Date(dueLeave.getTime() + 24 * H)) === 1440);
expect("still out past due -> counts now", delayMinutes(new Date(Date.now() - 2 * H)) >= 119);
expect("delay wording", formatDelay(45) === "45 min" && formatDelay(130) === "2 h 10 min" && formatDelay(1500) === "1 day 1 h",
  `${formatDelay(45)} / ${formatDelay(130)} / ${formatDelay(1500)}`);

// ── Exit QR window ──
const day = istDayRange(istDateToInstant("2026-11-02"));
const at10 = istDateTime("2026-11-02", "10:00")!;
const exit17 = istDateTime("2026-11-02", "17:00")!;
const w1 = exitQrExpiresAt({ exitDayStart: day.start, exitDayEnd: day.end, expectedExit: exit17, chosenMinutes: 60, now: at10 });
expect("approved 10 am for a 5 pm outing -> valid till 7 pm", w1.getTime() === exit17.getTime() + 2 * H, w1.toISOString());
const w2 = exitQrExpiresAt({ exitDayStart: day.start, exitDayEnd: day.end, expectedExit: istDateTime("2026-11-02", "10:15"), chosenMinutes: 360, now: at10 });
expect("longer chosen window still wins", w2.getTime() === at10.getTime() + 6 * H);
const late = istDateTime("2026-11-02", "23:00")!;
const w3 = exitQrExpiresAt({ exitDayStart: day.start, exitDayEnd: day.end, expectedExit: late, chosenMinutes: 60, now: at10 });
expect("never past the end of the exit day", w3.getTime() === day.end.getTime());
const w4 = exitQrExpiresAt({ exitDayStart: day.start, exitDayEnd: day.end, expectedExit: null, chosenMinutes: 60, now: at10 });
expect("no planned exit time -> the chosen window", w4.getTime() === at10.getTime() + H);
const tomorrow = istDayRange(istDateToInstant("2026-11-03"));
const w5 = exitQrExpiresAt({ exitDayStart: tomorrow.start, exitDayEnd: tomorrow.end, expectedExit: null, chosenMinutes: 60, now: at10 });
expect("advance pass -> its whole day", w5.getTime() === tomorrow.end.getTime());

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
