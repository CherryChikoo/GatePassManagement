"use server";

/**
 * Siros Venture labour: the coolies and contractors registered at the gate.
 *
 * - Registered once, with a photo: coolie = name, gender, photo; contractor =
 *   name, phone (optional), photo.
 * - Each person gets a number, given automatically: the next one after the
 *   highest so far, shared by coolies and contractors, so a number always
 *   means one person. Next time they come, the guard types the name or number.
 * - Stored as small register records (no extra tables). The number is also in
 *   the record's unique token, so two guards registering at the same moment
 *   can never get the same number (the second one simply takes the next).
 *
 * Free plan: the list is one small read (cached in the browser for 30 s and
 * refreshed by a live ping when someone registers); registering is one write.
 */

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { notifyLive } from "@/lib/realtime/notify";
import { istDateString, istDateToInstant } from "@/lib/time/ist";
import { isSafeStoragePath } from "@/lib/storage/storage-admin";

const PEOPLE_KEY = "SIROS_PERSON";
const LIVE_TOPIC = "reg:SIROS_PERSON";
const PHONE_RE = /^\+?[0-9]{10,15}$/;
const PHOTO_RE = /^registers\/[A-Za-z0-9_\-./]+$/;

export type SirosPerson = {
  id: string;
  no: number;
  kind: "COOLIE" | "CONTRACTOR";
  name: string;
  gender: string | null;
  phone: string | null;
};

type PersonData = { no?: number; kind?: string; name?: string; gender?: string | null; phone?: string | null; photoUrl?: string };

function toPerson(r: { id: string; data: unknown }): SirosPerson | null {
  const d = (r.data ?? {}) as PersonData;
  if (typeof d.no !== "number" || !d.name || (d.kind !== "COOLIE" && d.kind !== "CONTRACTOR")) return null;
  return { id: r.id, no: d.no, kind: d.kind, name: d.name, gender: d.gender ?? null, phone: d.phone ?? null };
}

/** Everyone registered (coolies and contractors), by number. */
export async function listSirosPeople() {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  const rows = await prisma.registerEntry.findMany({
    where: { register: PEOPLE_KEY, kind: "ORIGINAL" },
    orderBy: { createdAt: "asc" },
    take: 5000,
    select: { id: true, data: true },
  });
  const people = rows.map(toPerson).filter((p): p is SirosPerson => !!p).sort((a, b) => a.no - b.no);
  return { success: true, people };
}

/** Register a new coolie or contractor (with a photo); returns them with their new number. */
export async function addSirosPerson(input: { kind: string; name: string; gender?: string; phone?: string; photoUrl: string }) {
  const user = await requireRole("SECURITY", "ADMIN");
  const kind = input?.kind === "CONTRACTOR" ? "CONTRACTOR" : input?.kind === "COOLIE" ? "COOLIE" : null;
  if (!kind) return { error: "Choose coolie or contractor" };
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  if (name.length < 2) return { error: "Enter the name" };
  const photoUrl = typeof input?.photoUrl === "string" ? input.photoUrl.trim() : "";
  if (!photoUrl || !PHOTO_RE.test(photoUrl) || photoUrl.includes("..") || !isSafeStoragePath(photoUrl)) {
    return { error: "Take the photo first" };
  }
  let gender: string | null = null;
  let phone: string | null = null;
  if (kind === "COOLIE") {
    gender = input?.gender === "Male" || input?.gender === "Female" ? input.gender : null;
    if (!gender) return { error: "Choose the gender" };
  } else {
    const p = typeof input?.phone === "string" ? input.phone.replace(/[\s-]/g, "") : "";
    if (p && !PHONE_RE.test(p)) return { error: "Enter a valid phone number (10–15 digits)" };
    phone = p || null;
  }

  // The newest person has the highest number (numbers only ever go up)
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.registerEntry.findFirst({
      where: { register: PEOPLE_KEY, kind: "ORIGINAL" },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
    const no = (Number((last?.data as PersonData | null)?.no) || 0) + 1 + attempt;
    try {
      const row = await prisma.registerEntry.create({
        data: {
          register: PEOPLE_KEY,
          kind: "ORIGINAL",
          entryDate: istDateToInstant(istDateString()),
          data: { no, kind, name, gender, phone, photoUrl },
          searchText: `${no} ${name}`.toLowerCase(),
          // The number is unique: a second person can never get it
          clientToken: `siros-person-${no}`,
          recordedById: user.profileId,
          recordedByName: user.name,
          recordedByRole: user.role,
        },
        select: { id: true },
      });
      notifyLive(LIVE_TOPIC);
      return { success: true, person: { id: row.id, no, kind, name, gender, phone } satisfies SirosPerson };
    } catch (err: any) {
      if (err?.code === "P2002") continue; // someone took this number a moment ago: the next one
      console.error("[addSirosPerson] failed:", err?.message);
      return { error: "Could not save. Please try again." };
    }
  }
  return { error: "Could not save. Please try again." };
}
