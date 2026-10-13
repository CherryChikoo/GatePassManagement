import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Injecting TODAY's records to populate dashboard stats...");

  const students = await prisma.student.findMany({ take: 200 });
  const securityStaff = await prisma.securityStaff.findMany();
  const gates = await prisma.gate.findMany();

  if (students.length === 0 || securityStaff.length === 0) {
    return;
  }

  const now = new Date();
  
  // Create 100 APPROVED today
  // Create 50 REJECTED today
  // Create 100 EXITS today
  // Create 100 ENTRIES today
  
  for(let i=0; i<100; i++) {
    const student = students[i];
    const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;
    if (!approverId) continue;
    
    // Approved today
    await prisma.permission.create({
      data: {
         id: `perm-today-app-${i}`,
         studentId: student.id,
         type: "EXIT",
         approverType: student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY",
         approverId: approverId as string,
         status: "APPROVED",
         purpose: "Medical",
         destination: "Hospital",
         exitDate: now,
         createdAt: now,
         updatedAt: now,
         approvedAt: now
      }
    });
  }

  for(let i=100; i<150; i++) {
    const student = students[i];
    const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;
    if (!approverId) continue;
    
    // Rejected today
    await prisma.permission.create({
      data: {
         id: `perm-today-rej-${i}`,
         studentId: student.id,
         type: "EXIT",
         approverType: student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY",
         approverId: approverId as string,
         status: "REJECTED",
         purpose: "Movie",
         destination: "Mall",
         exitDate: now,
         createdAt: now,
         updatedAt: now,
         rejectedAt: now,
         rejectionReason: "Not allowed"
      }
    });
  }

  for(let i=0; i<100; i++) {
    const student = students[i];
    const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;
    if (!approverId) continue;
    
    const security = securityStaff[i % securityStaff.length];
    const gate = gates[i % gates.length];

    const perm = await prisma.permission.create({
      data: {
         id: `perm-today-exit-${i}`,
         studentId: student.id,
         type: "EXIT",
         approverType: student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY",
         approverId: approverId as string,
         status: "EXITED",
         purpose: "Home",
         destination: "Hometown",
         exitDate: now,
         createdAt: now,
         updatedAt: now,
         approvedAt: now
      }
    });

    await prisma.movement.create({
      data: {
        permissionId: perm.id,
        studentId: student.id,
        gateId: gate.id,
        securityUserId: security.id,
        type: "EXIT",
        createdAt: now
      }
    });
  }

  for(let i=100; i<200; i++) {
    const student = students[i];
    const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;
    if (!approverId) continue;
    
    const security = securityStaff[i % securityStaff.length];
    const gate = gates[i % gates.length];

    const perm = await prisma.permission.create({
      data: {
         id: `perm-today-entry-${i}`,
         studentId: student.id,
         type: "EXIT",
         approverType: student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY",
         approverId: approverId as string,
         status: "COMPLETED",
         purpose: "Shopping",
         destination: "Mall",
         exitDate: now,
         createdAt: now,
         updatedAt: now,
         approvedAt: now
      }
    });

    await prisma.movement.create({
      data: {
        permissionId: perm.id,
        studentId: student.id,
        gateId: gate.id,
        securityUserId: security.id,
        type: "ENTRY",
        createdAt: now
      }
    });
  }

  console.log("✅ Seeded TODAY'S operations successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
