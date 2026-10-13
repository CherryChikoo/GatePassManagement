import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔗 Assigning advisors to students...\n");

  const faculties = await prisma.faculty.findMany();
  const wardens = await prisma.warden.findMany();
  const students = await prisma.student.findMany({ include: { profile: true } });

  console.log(`Found ${faculties.length} faculty, ${wardens.length} wardens, ${students.length} students\n`);

  let assigned = 0;

  for (const student of students) {
    if (student.studentType === "HOSTELLER" && wardens.length > 0) {
      const warden = wardens[assigned % wardens.length];
      await prisma.student.update({
        where: { id: student.id },
        data: { wardenId: warden.id },
      });
      console.log(`✅ ${student.profile.name} → Warden`);
    } else if (faculties.length > 0) {
      const faculty = faculties[assigned % faculties.length];
      await prisma.student.update({
        where: { id: student.id },
        data: { 
          facultyId: faculty.id,
          studentType: "DAY_SCHOLAR", // Ensure day scholar if assigned faculty
        },
      });
      console.log(`✅ ${student.profile.name} → Faculty`);
    }
    assigned++;
  }

  console.log(`\n✅ Assigned ${assigned} students to advisors`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
