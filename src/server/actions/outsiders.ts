"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { revalidatePath } from "next/cache";
import { invalidateSecurityCache } from "./security";
import { invalidateAdminCaches } from "./admin";

export async function registerOutsider(data: {
  name: string;
  phone: string;
  category: string;
  purpose: string;
  visitingStudent?: string;
  gate?: string;
  vehicleNumber?: string;
  photoUrl?: string;
  entryTime?: string;
}) {
  await requireRole("SECURITY", "ADMIN");

  try {
    const outsider = await prisma.outsider.create({
      data: {
        name: data.name,
        phone: data.phone,
        category: data.category || "GUEST",
        purpose: data.purpose,
        visitingStudent: data.visitingStudent,
        gate: data.gate,
        vehicleNumber: data.vehicleNumber,
        photoUrl: data.photoUrl,
        status: "INSIDE",
        entryTime: data.entryTime ? new Date(data.entryTime) : new Date(),
      },
    });

    invalidateSecurityCache();
    invalidateAdminCaches();
    invalidateOutsidersCache();
    revalidatePath("/security");
    revalidatePath("/security/outsiders");

    return { success: true, outsiderId: outsider.id };
  } catch (error: any) {
    console.error("Failed to register outsider:", error);
    return { success: false, error: error.message || "Failed to register outsider." };
  }
}

export async function markOutsiderExited(id: string) {
  await requireRole("SECURITY", "ADMIN");

  try {
    await prisma.outsider.update({
      where: { id },
      data: {
        status: "EXITED",
        exitTime: new Date(),
      },
    });

    invalidateSecurityCache();
    invalidateAdminCaches();
    invalidateOutsidersCache();
    revalidatePath("/security");
    revalidatePath("/security/outsiders");

    return { success: true };
  } catch (error: any) {
    console.error("Failed to mark outsider exited:", error);
    return { success: false, error: "Failed to mark outsider exited." };
  }
}

let cachedOutsiders: { data: any; expiresAt: number } | null = null;

export async function invalidateOutsidersCache() {
  cachedOutsiders = null;
}

export async function getOutsiders() {
  await requireRole("SECURITY", "ADMIN");

  try {
    if (cachedOutsiders && cachedOutsiders.expiresAt > Date.now()) {
      return cachedOutsiders.data;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [inside, history] = await Promise.all([
      prisma.outsider.findMany({
        where: { status: "INSIDE", entryTime: { gte: today } },
        orderBy: { entryTime: "desc" },
      }),
      prisma.outsider.findMany({
        where: { 
          status: "EXITED",
          entryTime: { gte: today }
        },
        orderBy: { exitTime: "desc" },
      }),
    ]);

    const result = { success: true, inside, history };
    cachedOutsiders = { data: result, expiresAt: Date.now() + 15000 };
    return result;
  } catch (error: any) {
    console.error("Failed to fetch outsiders:", error);
    return { success: false, error: "Failed to fetch outsiders." };
  }
}
