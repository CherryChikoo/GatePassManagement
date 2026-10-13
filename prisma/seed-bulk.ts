import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Bulk seeding 4,000+ students and permissions...");

  const wardens = await prisma.warden.findMany();
  const faculties = await prisma.faculty.findMany();

  if (wardens.length === 0 || faculties.length === 0) {
    console.error("Please run the normal seed script first to create wardens and faculties.");
    return;
  }

  // Create 4000 profiles
  console.log("Creating 4,000 profiles...");
  const profilesData = [];
  for(let i=0; i<4000; i++) {
    profilesData.push({
      id: `profile-bulk-${i}`,
      userId: `fake-auth-${i}`,
      role: "STUDENT" as any,
      name: `Student ${i}`,
      email: `bulkstudent${i}@campus.edu`,
      phone: `+91-90000${String(i).padStart(5, '0')}`,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await prisma.profile.createMany({ data: profilesData, skipDuplicates: true });

  console.log("Creating 4,000 students...");
  const studentsData = [];
  for(let i=0; i<4000; i++) {
    const isHosteller = i % 2 === 0;
    const warden = wardens[i % wardens.length];
    const faculty = faculties[i % faculties.length];

    studentsData.push({
      id: `student-bulk-${i}`,
      profileId: `profile-bulk-${i}`,
      studentRoll: `23BULK${String(i).padStart(4, '0')}`,
      department: ["Computer Science", "Electronics", "Mechanical", "Civil"][i % 4],
      year: (i % 4) + 1,
      section: ["A", "B", "C"][i % 3],
      studentType: isHosteller ? "HOSTELLER" : "DAY_SCHOLAR",
      facultyId: faculty.id,
      wardenId: isHosteller ? warden.id : null,
      hostelBlock: isHosteller ? warden.hostelBlock : null,
      roomNumber: isHosteller ? `R-${i}` : null,
      status: "INSIDE",
    });
  }
  await prisma.student.createMany({ data: studentsData as any, skipDuplicates: true });

  console.log("Creating 2,000 realistic permission lifecycles (Approvals, QRs, Movements)...");
  
  const securityStaff = await prisma.securityStaff.findMany();
  const gates = await prisma.gate.findMany();
  if (securityStaff.length === 0 || gates.length === 0) {
     console.error("Missing Security Staff or Gates. Please run normal seed first.");
     return;
  }

  const now = new Date();
  
  // Helpers
  const purposes = ["Medical", "Shopping", "Weekend Leave", "Home Visit", "Project Work"];
  const destinations = ["Hospital", "City Mall", "Hometown", "Local Market", "Tech Park"];
  
  let pCount = 0;
  
  for(let i=0; i<2000; i++) {
     const student = studentsData[i];
     const date = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // within last 7 days
     
     // Distribute into 5 categories: 400 PENDING, 400 REJECTED, 400 APPROVED, 400 EXITED, 400 COMPLETED
     const categoryIndex = Math.floor(i / 400);
     const status = ["PENDING", "REJECTED", "APPROVED", "EXITED", "COMPLETED"][categoryIndex];
     
     const approverType = student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY";
     const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;
     
     const permission = await prisma.permission.create({
        data: {
           id: `perm-bulk-v2-${i}`,
           studentId: student.id,
           type: "EXIT" as any,
           approverType: approverType as any,
           approverId: approverId as string,
           status: status as any,
           purpose: purposes[i % purposes.length],
           destination: destinations[i % destinations.length],
           exitDate: date,
           expectedExit: date,
           createdAt: date,
           updatedAt: date,
           contactNumber: "+91-9999999999",
           approvedAt: ["APPROVED", "EXITED", "COMPLETED"].includes(status) ? date : null,
           rejectedAt: status === "REJECTED" ? date : null,
           rejectionReason: status === "REJECTED" ? "Insufficient attendance" : null
        }
     });

     // 1. Create Approval Record (If not pending)
     if (status !== "PENDING") {
        await prisma.permissionApproval.create({
           data: {
              permissionId: permission.id,
              approverType: approverType as any,
              facultyId: approverType === "FACULTY" ? approverId : null,
              wardenId: approverType === "WARDEN" ? approverId : null,
              approved: status !== "REJECTED",
              reason: status === "REJECTED" ? "Insufficient attendance" : "Approved",
              createdAt: date
           }
        });
     }

     // 2. Create QR Credential (If approved or later)
     if (["APPROVED", "EXITED", "COMPLETED"].includes(status)) {
        await prisma.qrCredential.create({
           data: {
              permissionId: permission.id,
              token: `qr_bulk_v2_${i}`,
              expiresAt: new Date(date.getTime() + 24 * 60 * 60 * 1000), // +24 hours
              active: ["APPROVED", "EXITED"].includes(status),
              usedForExit: ["EXITED", "COMPLETED"].includes(status),
              usedForEntry: status === "COMPLETED",
              createdAt: date
           }
        });
     }

     // 3. Create Security Movements
     const security = securityStaff[i % securityStaff.length];
     const gate = gates[i % gates.length];

     if (["EXITED", "COMPLETED"].includes(status)) {
        // Exit Movement
        await prisma.movement.create({
           data: {
              permissionId: permission.id,
              studentId: student.id,
              gateId: gate.id,
              securityUserId: security.id,
              type: "EXIT",
              notes: "Scanned and verified",
              createdAt: new Date(date.getTime() + 60 * 60 * 1000) // 1 hr after approval
           }
        });
        
        // Mark student as OUTSIDE
        if (status === "EXITED") {
           await prisma.student.update({
              where: { id: student.id },
              data: { status: "OUTSIDE" }
           });
        }
     }

     if (status === "COMPLETED") {
        // Entry Movement
        await prisma.movement.create({
           data: {
              permissionId: permission.id,
              studentId: student.id,
              gateId: gate.id,
              securityUserId: security.id,
              type: "ENTRY",
              notes: "Returned safely",
              createdAt: new Date(date.getTime() + 6 * 60 * 60 * 1000) // 6 hours after approval
           }
        });

        // Mark student back to INSIDE
        await prisma.student.update({
           where: { id: student.id },
           data: { status: "INSIDE" }
        });
     }
  }

  console.log("✅ Fully realistic data seeded (Permissions, Approvals, QRs, Movements, Student Statuses)!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
