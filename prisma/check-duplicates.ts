import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking for duplicate students...\n");

  const students = await prisma.student.findMany({
    include: { profile: true },
    orderBy: { profile: { email: "asc" } },
  });

  console.log(`Total students: ${students.length}\n`);

  students.forEach((s) => {
    console.log(`${s.studentRoll?.padEnd(12) || "NO-ROLL".padEnd(12)} - ${s.profile.name.padEnd(25)} - ${s.profile.email}`);
  });

  // Check for duplicate permissions
  console.log("\n📋 Checking permissions...\n");
  
  const permissions = await prisma.permission.findMany({
    include: { student: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total permissions: ${permissions.length}\n`);

  permissions.forEach((p) => {
    console.log(`${(p.student?.profile?.name || "Unknown").padEnd(25)} - ${p.purpose.padEnd(20)} - ${p.status}`);
  });

  // Group by student to find duplicates
  const studentPermissionCount = new Map<string, number>();
  permissions.forEach((p) => {
    if (p.studentId) {
      const count = studentPermissionCount.get(p.studentId) || 0;
      studentPermissionCount.set(p.studentId, count + 1);
    }
  });

  console.log("\n📊 Permissions per student:\n");
  for (const [studentId, count] of studentPermissionCount) {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      console.log(`${student.profile.name.padEnd(25)} - ${count} permission${count > 1 ? "s" : ""} ${count > 1 ? "❌" : "✅"}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
