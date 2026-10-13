import { requireAuth } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { SettingsClient } from "./client";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await requireAuth();

  if (user.role === "STUDENT") {
    redirect("/student");
  }

  const extraData: Record<string, any> = {};

  // Fetch faculty extra details for Faculty, HOD, Director, and Dean
  if (user.role === "FACULTY" || user.role === "FACULTY_ADMIN" || user.role === "DIRECTOR" || user.role === "DEAN") {
    const fac = await prisma.faculty.findUnique({
      where: { profileId: user.id },
      select: { department: true, designation: true, employeeId: true },
    });
    if (fac) {
      extraData.department = fac.department || "";
      extraData.designation = fac.designation || "";
      extraData.employeeId = fac.employeeId || "";
    }
  }

  // Fetch phone number from profile
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { phone: true },
  });
  if (profile?.phone) {
    extraData.phone = profile.phone;
  }

  return <SettingsClient user={{ ...user, ...extraData }} />;
}
