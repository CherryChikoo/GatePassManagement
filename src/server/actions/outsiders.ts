"use server";

import { prisma } from "@/lib/db/prisma";
import { notifyLive } from "@/lib/realtime/notify";
import { requireRole } from "@/lib/auth/helpers";
import { revalidatePath } from "next/cache";
import { invalidateSecurityCache } from "./security";
import { invalidateAdminCaches } from "./admin";
import { outsiderSchema } from "@/lib/validation/schemas";
import { isSafeStoragePath } from "@/lib/storage/storage-admin";
import { istStartOfDay } from "@/lib/time/ist";


let cachedOutsiders: { data: any; expiresAt: number } | null = null;

function clearOutsidersCache() {
  cachedOutsiders = null;
}

export async function invalidateOutsidersCache() {
  await requireRole("SECURITY", "ADMIN");
  clearOutsidersCache();
}

async function afterOutsiderChange() {
  await invalidateSecurityCache();
  await invalidateAdminCaches();
  clearOutsidersCache();
  revalidatePath("/security");
  revalidatePath("/security/visitors");
  revalidatePath("/admin/activity");
  notifyLive("visitors");
}

export async function registerOutsider(data: Record<string, unknown>) {
  // The guard is taken from the session, never from the form
  const user = await requireRole("SECURITY", "ADMIN");

  const parsed = outsiderSchema.safeParse(data ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  if (input.photoUrl && !isSafeStoragePath(input.photoUrl)) {
    return { success: false, error: "Invalid photo reference" };
  }

  // Entry time is always the live time of registration (never typed in)
  const entryTime = new Date();

  // Name, mobile number and a photo are mandatory; every other input is optional
  if (!input.name || input.name.trim().length < 2) return { success: false, error: "Visitor name is required" };
  if (!input.phone) return { success: false, error: "Mobile number is required" };
  if (!input.vehicleNumber || !input.vehicleNumber.trim()) {
    return { success: false, error: "Enter the vehicle number, or tap No vehicle" };
  }
  if (!input.photoUrl) return { success: false, error: "Take the visitor's photo before registering" };

  try {
    // A double tap or a retried request must not log the same visitor twice:
    // the same person (name + mobile), still inside, registered in the last
    // 2 minutes is the same registration.
    const recent = await prisma.outsider.findFirst({
      where: {
        phone: input.phone,
        name: { equals: input.name.trim(), mode: "insensitive" },
        status: "INSIDE",
        entryTime: { gte: new Date(Date.now() - 2 * 60_000) },
      },
      select: { id: true },
    });
    if (recent) return { success: true, outsiderId: recent.id, duplicate: true };

    const outsider = await prisma.outsider.create({
      data: {
        name: input.name || "",
        phone: input.phone || "",
        category: input.category || "GUEST",
        purpose: input.purpose || "",
        visitingStudent: input.visitingStudent || null,
        gate: input.gate || null,
        vehicleNumber: input.vehicleNumber || null,
        photoUrl: input.photoUrl || null,
        address: input.address || null,
        department: input.department || null,
        remarks: input.remarks || null,
        recordedById: user.profileId,
        recordedByName: user.name,
        status: "INSIDE",
        entryTime,
      },
      select: { id: true },
    });

    await afterOutsiderChange();
    return { success: true, outsiderId: outsider.id };
  } catch (error: any) {
    console.error("Failed to register outsider:", error?.message);
    return { success: false, error: "Failed to register visitor." };
  }
}

export async function markOutsiderExited(id: string) {
  await requireRole("SECURITY", "ADMIN");
  if (typeof id !== "string" || !id) return { success: false, error: "Invalid visitor" };

  const updated = await prisma.outsider.updateMany({
    where: { id, status: "INSIDE" },
    data: { status: "EXITED", exitTime: new Date() },
  });

  if (updated.count !== 1) {
    return { success: false, error: "Visitor not found or already marked as exited." };
  }

  await afterOutsiderChange();
  return { success: true };
}

export async function getOutsiders() {
  await requireRole("SECURITY", "ADMIN");

  try {
    if (cachedOutsiders && cachedOutsiders.expiresAt > Date.now()) {
      return cachedOutsiders.data;
    }

    const today = istStartOfDay();

    const [inside, history] = await Promise.all([
      // Everyone still on campus, including visitors who arrived on earlier days
      prisma.outsider.findMany({
        where: { status: "INSIDE" },
        orderBy: { entryTime: "desc" },
        take: 500,
      }),
      prisma.outsider.findMany({
        where: { status: "EXITED", exitTime: { gte: today } },
        orderBy: { exitTime: "desc" },
        take: 500,
      }),
    ]);

    const result = { success: true, inside, history };
    cachedOutsiders = { data: result, expiresAt: Date.now() + 15000 };
    return result;
  } catch (error: any) {
    console.error("Failed to fetch outsiders:", error?.message);
    return { success: false, error: "Failed to fetch outsiders." };
  }
}

// ─── Main Admin: correct or remove any visitor record, any day ───────────────

const VISITOR_CATEGORIES = ["GUEST", "PARENT", "VENDOR", "WORKER"] as const;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** "2026-10-19T10:51" (India time, from the edit form) → Date */
const istDateTime = (v: string) => new Date(`${v}:00+05:30`);

export async function adminUpdateVisitor(id: string, input: Record<string, unknown>) {
  await requireRole("ADMIN");
  if (typeof id !== "string" || !id) return { error: "Visitor not found" };
  const text = (k: string, max: number) => (typeof input?.[k] === "string" ? (input[k] as string).trim().slice(0, max) : "");

  const name = text("name", 100);
  const phone = text("phone", 20);
  const purpose = text("purpose", 500);
  const category = text("category", 20);
  const entry = text("entryTime", 16);
  const exit = text("exitTime", 16);
  if (!name) return { error: "Enter the visitor's name" };
  if (!/^\+?[0-9][0-9\s-]{8,16}[0-9]$/.test(phone)) return { error: "Enter a valid phone number" };
  if (!purpose) return { error: "Enter the purpose of the visit" };
  if (!(VISITOR_CATEGORIES as readonly string[]).includes(category)) return { error: "Choose a category" };
  if (!DATETIME_RE.test(entry)) return { error: "Enter the entry date and time" };
  if (exit && !DATETIME_RE.test(exit)) return { error: "Enter a valid exit date and time" };
  const entryTime = istDateTime(entry);
  const exitTime = exit ? istDateTime(exit) : null;
  if (exitTime && exitTime < entryTime) return { error: "Exit time can't be before the entry time" };

  const updated = await prisma.outsider.updateMany({
    where: { id },
    data: {
      name,
      phone,
      purpose,
      category,
      visitingStudent: text("visitingStudent", 100) || null,
      department: text("department", 100) || null,
      address: text("address", 300) || null,
      vehicleNumber: text("vehicleNumber", 30) || null,
      gate: text("gate", 100) || null,
      remarks: text("remarks", 500) || null,
      entryTime,
      exitTime,
      // Exit time decides whether they are still inside
      status: exitTime ? "EXITED" : "INSIDE",
    },
  });
  if (updated.count !== 1) return { error: "Visitor not found" };
  await afterOutsiderChange();
  return { success: true };
}

export async function adminDeleteVisitor(id: string) {
  await requireRole("ADMIN");
  if (typeof id !== "string" || !id) return { error: "Visitor not found" };
  const deleted = await prisma.outsider.deleteMany({ where: { id } });
  if (deleted.count !== 1) return { error: "Visitor not found" };
  await afterOutsiderChange();
  return { success: true };
}
