"use server";

import { prisma } from "@/lib/db/prisma";
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

  // Every input is optional, but a visitor record needs at least one detail
  if (![input.name, input.phone, input.purpose, input.visitingStudent, input.vehicleNumber, input.address, input.department, input.remarks, input.photoUrl].some((v) => v && String(v).trim())) {
    return { success: false, error: "Enter at least one detail" };
  }

  try {
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
