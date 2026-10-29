import { NextResponse } from "next/server";
import { decodeGateArgs } from "@/lib/gate-wire";
import { getAuthUser } from "@/lib/auth/helpers";
import { verifyQrScan, registerExit, registerEntry, prepareGatePhoto, getSecurityLogData } from "@/server/actions/security";
import {
  createRegisterEntry,
  completeRegisterEntry,
  securityEditRegisterEntry,
  updateRegisterField,
  getRegisterStaffOptions,
  getRegisterPeopleOptions,
  getRegisterCountsToday,
  getFacultyBook,
  getStudentBook,
  getVisitorsBook,
  getHostelOutingBook,
  getHomeOutingSummary,
  getHomeOutingDay,
  listOutingNotes,
  getMovementDetails,
  getVisitorDetails,
  getPassGatePhotos,
  markFacultyReturn,
} from "@/server/actions/registers";
import { registerOutsider, markOutsiderExited, getOutsiders } from "@/server/actions/outsiders";
import { uploadOutsiderPhoto, uploadRegisterPhoto, getRegisterPhotoUrl, getExitPhotoUrl } from "@/lib/storage/image-upload";
import { getVisitHostOptions } from "@/server/actions/visits";
import { generateLiveQrToken } from "@/server/actions/permissions";
import { getUsers } from "@/server/actions/admin";
import { getCampusActivity, getExecutiveStudents } from "@/server/actions/executive";
import { getHodActivity } from "@/server/actions/hod-activity";
import { confirmHostelArrival, getHostelPassesToday, verifyHostelPass } from "@/server/actions/warden-scan";
import { listCustomRegisters } from "@/server/actions/custom-registers";
import { getAttendanceMonth } from "@/server/actions/attendance";

/**
 * Gate calls (Security screens) as plain requests instead of server actions.
 *
 * The browser runs a page's server actions (and page refreshes) one at a
 * time, and a stalled one cannot be cancelled — on a weak gate network one
 * stuck call froze every later save and load on the screen. Through this
 * route each call is its own request: calls run side by side, and the
 * screen cancels a call that takes too long (callGate, src/lib/gate-call.ts),
 * so "Try again" really sends a new one.
 *
 * Only the functions listed here can be called; each still checks the
 * signed-in user's role itself, exactly as when used as a server action.
 *
 * POST { fn: "<name>", args: [...] }  ->  the function's result (JSON)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GATE_FUNCTIONS = {
  verifyQrScan,
  registerExit,
  registerEntry,
  prepareGatePhoto,
  createRegisterEntry,
  completeRegisterEntry,
  securityEditRegisterEntry,
  updateRegisterField,
  getRegisterStaffOptions,
  getRegisterPeopleOptions,
  getRegisterCountsToday,
  registerOutsider,
  markOutsiderExited,
  uploadOutsiderPhoto,
  uploadRegisterPhoto,
  getRegisterPhotoUrl,
  getExitPhotoUrl,
  getVisitHostOptions,
  // Screen data (read only)
  getOutsiders,
  getSecurityLogData,
  getFacultyBook,
  getStudentBook,
  getVisitorsBook,
  getHostelOutingBook,
  getHomeOutingSummary,
  getHomeOutingDay,
  listOutingNotes,
  getMovementDetails,
  getVisitorDetails,
  getPassGatePhotos,
  markFacultyReturn,
  // Pass holder's rotating QR code (students, faculty)
  generateLiveQrToken,
  // Admin → Users list (role tabs and pages switch without a page load)
  getUsers,
  // Director / Dean / Supervisor student directory (one page at a time)
  getExecutiveStudents,
  // Director / Dean / Supervisor activity (one day)
  getCampusActivity,
  getHodActivity,
  // Warden's hostel scan
  getHostelPassesToday,
  verifyHostelPass,
  confirmHostelArrival,
  // Register builder list, attendance sheet
  listCustomRegisters,
  getAttendanceMonth,
} as const;

export type GateFunctions = typeof GATE_FUNCTIONS;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  // Quick answer for a signed-out phone (each function checks its own role too)
  if (!(await getAuthUser())) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { fn?: unknown; args?: unknown } | null;
  const name = typeof body?.fn === "string" ? body.fn : "";
  const fn = Object.prototype.hasOwnProperty.call(GATE_FUNCTIONS, name) ? (GATE_FUNCTIONS as Record<string, (...a: unknown[]) => Promise<unknown>>)[name] : null;
  if (!fn) return NextResponse.json({ error: "Unknown request" }, { status: 400, headers: NO_STORE });
  // Left-out optional arguments arrive as markers (JSON has no undefined): restore them
  const args = Array.isArray(body?.args) ? decodeGateArgs(body.args) : [];

  try {
    const result = await fn(...args);
    return NextResponse.json(result ?? null, { headers: NO_STORE });
  } catch (err: any) {
    // requireRole sends a signed-out / wrong-role user away with a redirect
    if (String(err?.digest ?? err?.message ?? "").includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: NO_STORE });
    }
    console.error(`[gate] ${name} failed:`, err?.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
