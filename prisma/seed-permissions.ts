import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding permissions (1 per student)...\n");

  const studentRecords = await prisma.student.findMany({
    where: {
      OR: [
        { facultyId: { not: null } },
        { wardenId: { not: null } },
      ],
    },
    include: { faculty: true, warden: true, profile: true },
  });

  console.log(`Found ${studentRecords.length} students\n`);

  const purposes = [
    "Medical Appointment",
    "Family Function",
    "Interview",
    "Home Visit",
    "Project Work",
    "Bank Work",
    "Shopping",
    "Hospital Visit",
  ];

  const destinations = [
    "City Hospital",
    "Home Town",
    "Company Office",
    "Railway Station",
    "District Hospital",
    "Local Market",
    "Coaching Center",
    "Eluru",
  ];

  let permissionCount = 0;

  for (const student of studentRecords) {
    const approverType = student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY";
    const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;

    if (!approverId) {
      console.log(`⚠️  Skipping ${student.profile.name} - no approver assigned`);
      continue;
    }

    // Random date in last 7 days
    const daysAgo = Math.floor(Math.random() * 7);
    const exitDate = new Date();
    exitDate.setDate(exitDate.getDate() - daysAgo);
    exitDate.setHours(14, 0, 0, 0); // 2 PM

    // Only PENDING status - clean slate
    const status = "PENDING";

    const permission = await prisma.permission.create({
      data: {
        studentId: student.id,
        approverType: approverType as any,
        approverId,
        status: status as any,
        purpose: purposes[Math.floor(Math.random() * purposes.length)],
        destination: destinations[Math.floor(Math.random() * destinations.length)],
        exitDate,
        expectedExit: new Date(exitDate.getTime() + 2 * 60 * 60 * 1000), // +2 hours
        expectedReturn: new Date(exitDate.getTime() + 6 * 60 * 60 * 1000), // +6 hours
        contactNumber: student.profile.phone || "+91-9876543210",
      },
    });

    console.log(`✅ ${student.profile.name} - ${permission.purpose}`);
    permissionCount++;
  }

  console.log(`\n✅ Created ${permissionCount} permissions (1 per student)\n`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
