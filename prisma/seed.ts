import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

// Initialize Supabase Admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log("🌱 Seeding database with test data...\n");

  // ─────────────────────────────────────────────────────────────
  // 1. Create Gates
  // ─────────────────────────────────────────────────────────────
  console.log("📍 Creating gates...");
  
  const mainGate = await prisma.gate.upsert({
    where: { name: "Main Gate" },
    update: {},
    create: { name: "Main Gate", location: "North Campus Entrance" },
  });

  const backGate = await prisma.gate.upsert({
    where: { name: "Back Gate" },
    update: {},
    create: { name: "Back Gate", location: "South Campus Exit" },
  });

  const hostelGate = await prisma.gate.upsert({
    where: { name: "Hostel Gate" },
    update: {},
    create: { name: "Hostel Gate", location: "Hostel Area Entry/Exit" },
  });

  console.log(`✅ Gates: ${mainGate.name}, ${backGate.name}, ${hostelGate.name}\n`);

  // ─────────────────────────────────────────────────────────────
  // 2. Create Test Users in Supabase Auth + Database
  // ─────────────────────────────────────────────────────────────
  console.log("👥 Creating test users...\n");

  const testUsers = [
    // ──── ADMIN (2) ────
    {
      email: "admin@campus.edu",
      name: "Dr. Sarah Johnson",
      role: "ADMIN",
      phone: "+91-9876543210",
    },
    {
      email: "admin2@campus.edu",
      name: "Prof. Michael Chen",
      role: "ADMIN",
      phone: "+91-9876543211",
    },

    // ──── FACULTY (4) ────
    {
      email: "faculty1@campus.edu",
      name: "Dr. Priya Sharma",
      role: "FACULTY",
      phone: "+91-9876543212",
      extra: { employeeId: "FAC001", department: "Computer Science", designation: "Associate Professor" },
    },
    {
      email: "faculty2@campus.edu",
      name: "Prof. Rajesh Kumar",
      role: "FACULTY",
      phone: "+91-9876543213",
      extra: { employeeId: "FAC002", department: "Electronics", designation: "Professor" },
    },
    {
      email: "faculty3@campus.edu",
      name: "Dr. Anita Desai",
      role: "FACULTY",
      phone: "+91-9876543214",
      extra: { employeeId: "FAC003", department: "Mechanical", designation: "Assistant Professor" },
    },
    {
      email: "faculty4@campus.edu",
      name: "Dr. Vikram Patel",
      role: "FACULTY",
      phone: "+91-9876543215",
      extra: { employeeId: "FAC004", department: "Civil", designation: "Associate Professor" },
    },

    // ──── WARDEN (2) ────
    {
      email: "warden1@campus.edu",
      name: "Mr. Suresh Reddy",
      role: "WARDEN",
      phone: "+91-9876543216",
      extra: { employeeId: "WRD001", hostelBlock: "Block A - Boys" },
    },
    {
      email: "warden2@campus.edu",
      name: "Mrs. Lakshmi Nair",
      role: "WARDEN",
      phone: "+91-9876543217",
      extra: { employeeId: "WRD002", hostelBlock: "Block B - Girls" },
    },

    // ──── SECURITY (2) ────
    {
      email: "security1@campus.edu",
      name: "Mr. Ravi Singh",
      role: "SECURITY",
      phone: "+91-9876543218",
      extra: { employeeId: "SEC001", gateId: mainGate.id },
    },
    {
      email: "security2@campus.edu",
      name: "Mr. Anil Verma",
      role: "SECURITY",
      phone: "+91-9876543219",
      extra: { employeeId: "SEC002", gateId: backGate.id },
    },

    // ──── STUDENTS (10) ────
    // Day Scholars (5)
    {
      email: "student1@campus.edu",
      name: "Aarav Gupta",
      role: "STUDENT",
      phone: "+91-9876543220",
      extra: {
        studentRoll: "21BCS101",
        department: "Computer Science",
        year: 3,
        section: "A",
        studentType: "DAY_SCHOLAR",
      },
    },
    {
      email: "student2@campus.edu",
      name: "Diya Iyer",
      role: "STUDENT",
      phone: "+91-9876543221",
      extra: {
        studentRoll: "22BEC201",
        department: "Electronics",
        year: 2,
        section: "B",
        studentType: "DAY_SCHOLAR",
      },
    },
    {
      email: "student3@campus.edu",
      name: "Arjun Mehta",
      role: "STUDENT",
      phone: "+91-9876543222",
      extra: {
        studentRoll: "21BME301",
        department: "Mechanical",
        year: 3,
        section: "A",
        studentType: "DAY_SCHOLAR",
      },
    },
    {
      email: "student4@campus.edu",
      name: "Ishaan Kapoor",
      role: "STUDENT",
      phone: "+91-9876543223",
      extra: {
        studentRoll: "22BCE401",
        department: "Civil",
        year: 2,
        section: "C",
        studentType: "DAY_SCHOLAR",
      },
    },
    {
      email: "student5@campus.edu",
      name: "Ananya Singh",
      role: "STUDENT",
      phone: "+91-9876543224",
      extra: {
        studentRoll: "21BCS501",
        department: "Computer Science",
        year: 3,
        section: "B",
        studentType: "DAY_SCHOLAR",
      },
    },
    // Hostellers (5)
    {
      email: "student6@campus.edu",
      name: "Rohan Joshi",
      role: "STUDENT",
      phone: "+91-9876543225",
      extra: {
        studentRoll: "21BCS601",
        department: "Computer Science",
        year: 3,
        section: "A",
        studentType: "HOSTELLER",
        hostelBlock: "Block A - Boys",
        roomNumber: "A-205",
      },
    },
    {
      email: "student7@campus.edu",
      name: "Priya Rao",
      role: "STUDENT",
      phone: "+91-9876543226",
      extra: {
        studentRoll: "22BEC701",
        department: "Electronics",
        year: 2,
        section: "A",
        studentType: "HOSTELLER",
        hostelBlock: "Block B - Girls",
        roomNumber: "B-312",
      },
    },
    {
      email: "student8@campus.edu",
      name: "Kabir Malhotra",
      role: "STUDENT",
      phone: "+91-9876543227",
      extra: {
        studentRoll: "21BME801",
        department: "Mechanical",
        year: 3,
        section: "B",
        studentType: "HOSTELLER",
        hostelBlock: "Block A - Boys",
        roomNumber: "A-118",
      },
    },
    {
      email: "student9@campus.edu",
      name: "Sara Khan",
      role: "STUDENT",
      phone: "+91-9876543228",
      extra: {
        studentRoll: "22BCE901",
        department: "Civil",
        year: 2,
        section: "A",
        studentType: "HOSTELLER",
        hostelBlock: "Block B - Girls",
        roomNumber: "B-425",
      },
    },
    {
      email: "student10@campus.edu",
      name: "Aditya Nair",
      role: "STUDENT",
      phone: "+91-9876543229",
      extra: {
        studentRoll: "21BCS1001",
        department: "Computer Science",
        year: 3,
        section: "C",
        studentType: "HOSTELLER",
        hostelBlock: "Block A - Boys",
        roomNumber: "A-307",
      },
    },
  ];

  const createdUsers: any[] = [];

  // Never derive passwords from emails. Use SEED_DEFAULT_PASSWORD, or a random one.
  const seedPassword =
    process.env.SEED_DEFAULT_PASSWORD || require("crypto").randomBytes(12).toString("base64url");

  for (const user of testUsers) {
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: seedPassword,
        email_confirm: true,
      });

      if (authError) {
        console.log(`⚠️  Skipping ${user.email}: ${authError.message}`);
        continue;
      }

      const userId = authData.user.id;

      // Create profile in database
      const profile = await prisma.profile.create({
        data: {
          userId,
          role: user.role as any,
          name: user.name,
          email: user.email,
          phone: user.phone,
          active: true,
        },
      });

      // Create role-specific records
      if (user.role === "FACULTY" && user.extra) {
        await prisma.faculty.create({
          data: {
            profileId: profile.id,
            employeeId: user.extra.employeeId,
            department: user.extra.department,
            designation: user.extra.designation,
            maxApprovals: 5,
          },
        });
      } else if (user.role === "WARDEN" && user.extra) {
        await prisma.warden.create({
          data: {
            profileId: profile.id,
            employeeId: user.extra.employeeId,
            hostelBlock: user.extra.hostelBlock,
          },
        });
      } else if (user.role === "SECURITY" && user.extra) {
        await prisma.securityStaff.create({
          data: {
            profileId: profile.id,
            employeeId: user.extra.employeeId,
            gateId: user.extra.gateId,
          },
        });
      } else if (user.role === "STUDENT" && user.extra) {
        await prisma.student.create({
          data: {
            profileId: profile.id,
            studentRoll: user.extra.studentRoll || `STU-${Date.now()}`,
            department: user.extra.department,
            year: user.extra.year,
            section: user.extra.section,
            studentType: (user.extra.studentType as any) || "DAY_SCHOLAR",
            hostelBlock: user.extra.hostelBlock,
            roomNumber: user.extra.roomNumber,
            status: "INSIDE",
          },
        });
      }

      createdUsers.push({ ...user, userId, profileId: profile.id });
      console.log(`✅ ${user.role.padEnd(10)} - ${user.name.padEnd(25)} - ${user.email}`);
    } catch (error: any) {
      console.log(`⚠️  Error creating ${user.email}:`, error.message);
    }
  }

  console.log(`\n✅ Created ${createdUsers.length} test users\n`);

  // ─────────────────────────────────────────────────────────────
  // 3. Assign Faculty/Wardens to Students
  // ─────────────────────────────────────────────────────────────
  console.log("🔗 Assigning advisors to students...");

  const faculties = await prisma.faculty.findMany({ include: { profile: true } });
  const wardens = await prisma.warden.findMany({ include: { profile: true } });
  const students = await prisma.student.findMany({ include: { profile: true } });

  for (const student of students) {
    // Assign faculty (round-robin)
    const facultyIndex = students.indexOf(student) % faculties.length;
    const assignedFaculty = faculties[facultyIndex];

    await prisma.student.update({
      where: { id: student.id },
      data: { facultyId: assignedFaculty.id },
    });

    // Assign warden if hosteller
    if (student.studentType === "HOSTELLER") {
      const warden = wardens.find((w) => w.hostelBlock === student.hostelBlock);
      if (warden) {
        await prisma.student.update({
          where: { id: student.id },
          data: { wardenId: warden.id },
        });
      }
    }
  }

  console.log(`✅ Assigned faculty advisors and wardens\n`);

  // ─────────────────────────────────────────────────────────────
  // 4. Create Sample Permissions
  // ─────────────────────────────────────────────────────────────
  console.log("📝 Creating sample permission requests...");

  const studentRecords = await prisma.student.findMany({
    include: { faculty: true, warden: true, profile: true },
  });

  const purposes = [
    "Medical Appointment",
    "Family Function",
    "Interview",
    "Home Visit",
    "Project Work",
    "Bank Work",
    "Shopping",
    "Hospital Visit",
    "Coaching Classes",
    "Personal Work",
  ];

  const destinations = [
    "City Hospital",
    "Home Town",
    "Company Office",
    "Railway Station",
    "Engineering College",
    "Central Bank",
    "City Mall",
    "District Hospital",
    "Coaching Center",
    "Local Market",
  ];

  let permissionCount = 0;

  for (let i = 0; i < studentRecords.length; i++) {
    const student = studentRecords[i];
    const numPermissions = 1; // Only 1 permission per student for cleaner test data

    for (let j = 0; j < numPermissions; j++) {
      const daysAgo = Math.floor(Math.random() * 30); // Last 30 days
      const exitDate = new Date();
      exitDate.setDate(exitDate.getDate() - daysAgo);

      const approverType = student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY";
      const approverId = student.studentType === "HOSTELLER" ? student.wardenId : student.facultyId;

      if (!approverId) continue;

      const statuses = ["APPROVED", "PENDING", "REJECTED", "COMPLETED"];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

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
          contactNumber: student.profile.phone || "+91-9876543200",
          approvedAt: status !== "PENDING" ? exitDate : null,
          rejectedAt: status === "REJECTED" ? exitDate : null,
          rejectionReason: status === "REJECTED" ? "Prior commitments not informed" : null,
        },
      });

      // Create approval record if not pending
      if (status !== "PENDING") {
        await prisma.permissionApproval.create({
          data: {
            permissionId: permission.id,
            approverType: approverType as any,
            facultyId: approverType === "FACULTY" ? approverId : null,
            wardenId: approverType === "WARDEN" ? approverId : null,
            approved: status !== "REJECTED",
            reason: status === "REJECTED" ? "Schedule conflict" : "Approved",
          },
        });
      }

      // Create QR credential if approved
      if (status === "APPROVED" || status === "COMPLETED") {
        const token = `qr_${permission.id}_${Date.now()}`;
        const expiresAt = new Date(exitDate.getTime() + 24 * 60 * 60 * 1000); // +24 hours

        await prisma.qrCredential.create({
          data: {
            permissionId: permission.id,
            token,
            expiresAt,
            active: status === "APPROVED",
            usedForExit: status === "COMPLETED",
            usedForEntry: status === "COMPLETED",
          },
        });
      }

      permissionCount++;
    }
  }

  console.log(`✅ Created ${permissionCount} permission requests\n`);

  // ─────────────────────────────────────────────────────────────
  // 5. Create Sample Movements
  // ─────────────────────────────────────────────────────────────
  console.log("🚪 Creating sample movement logs...");

  const completedPermissions = await prisma.permission.findMany({
    where: { status: "COMPLETED" },
    include: { student: true, qr: true },
  });

  const securityStaff = await prisma.securityStaff.findMany();
  const gates = [mainGate, backGate, hostelGate];

  let movementCount = 0;

  for (const permission of completedPermissions) {
    const security = securityStaff[Math.floor(Math.random() * securityStaff.length)];
    const gate = gates[Math.floor(Math.random() * gates.length)];

    // Exit movement
    await prisma.movement.create({
      data: {
        permissionId: permission.id,
        studentId: permission.studentId,
        gateId: gate.id,
        securityUserId: security.id,
        type: "EXIT",
        notes: "Scanned and verified",
        createdAt: permission.exitDate,
      },
    });

    // Entry movement (2-5 hours later)
    const entryTime = new Date(permission.exitDate.getTime() + (Math.random() * 3 + 2) * 60 * 60 * 1000);
    await prisma.movement.create({
      data: {
        permissionId: permission.id,
        studentId: permission.studentId,
        gateId: gate.id,
        securityUserId: security.id,
        type: "ENTRY",
        notes: "Returned successfully",
        createdAt: entryTime,
      },
    });

    movementCount += 2;
  }

  console.log(`✅ Created ${movementCount} movement records\n`);

  // ─────────────────────────────────────────────────────────────
  // Final Summary
  // ─────────────────────────────────────────────────────────────
  console.log("═".repeat(60));
  console.log("🎉 SEEDING COMPLETE!");
  console.log("═".repeat(60));
  console.log("\n📊 SUMMARY:");
  console.log(`   • Gates: 3`);
  console.log(`   • Users: ${createdUsers.length}`);
  console.log(`     - Admins: 2`);
  console.log(`     - Faculty: 4`);
  console.log(`     - Wardens: 2`);
  console.log(`     - Security: 2`);
  console.log(`     - Students: 10 (5 day scholars, 5 hostellers)`);
  console.log(`   • Permissions: ${permissionCount}`);
  console.log(`   • Movements: ${movementCount}`);
  console.log("\n🔐 LOGIN CREDENTIALS:");
  console.log("   Email: [any email from above]");
  console.log(`   Password (all seeded accounts): ${seedPassword}`);
  console.log("   ⚠️  Development data only — never seed production. Change passwords after first login.");
  console.log("\n📝 TEST ACCOUNTS:");
  console.log("   Admin:    admin@campus.edu");
  console.log("   Faculty:  faculty1@campus.edu");
  console.log("   Warden:   warden1@campus.edu");
  console.log("   Security: security1@campus.edu");
  console.log("   Student:  student1@campus.edu (Day Scholar)");
  console.log("   Student:  student6@campus.edu (Hosteller)");
  console.log("\n" + "═".repeat(60));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
