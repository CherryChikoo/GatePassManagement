import { avatarUrlFor, requireAuth } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { SettingsClient } from "./client";

export default async function SettingsPage() {
  const user = await requireAuth();

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
    select: { phone: true, designation: true },
  });
  if (profile?.phone) {
    extraData.phone = profile.phone;
  }
  // Admin, Warden, Security, Supervisor: designation lives on the profile
  if (!extraData.designation && profile?.designation) {
    extraData.designation = profile.designation;
  }

  return <SettingsClient user={{ ...user, ...extraData }} avatarUrl={avatarUrlFor(user)} />;
}
