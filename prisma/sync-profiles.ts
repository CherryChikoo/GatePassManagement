import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("🔄 Syncing profiles from Supabase Auth...\n");

  // Define expected users
  const expectedUsers = [
    { email: "admin@campus.edu", name: "Admin User", role: "ADMIN" },
    { email: "admin2@campus.edu", name: "HOD", role: "FACULTY_ADMIN" },
    { email: "faculty1@campus.edu", name: "Prof. Rajesh Kumar", role: "FACULTY", dept: "Computer Science" },
    { email: "faculty2@campus.edu", name: "Dr. Priya Sharma", role: "FACULTY", dept: "Electronics" },
    { email: "faculty3@campus.edu", name: "Prof. Amit Patel", role: "FACULTY", dept: "Mechanical" },
    { email: "faculty4@campus.edu", name: "Dr. Sneha Reddy", role: "FACULTY", dept: "Civil" },
    { email: "warden1@campus.edu", name: "Mr. Vikram Singh", role: "WARDEN", block: "A-Block" },
    { email: "warden2@campus.edu", name: "Ms. Kavita Nair", role: "WARDEN", block: "B-Block" },
    { email: "security1@campus.edu", name: "Ramesh Gupta", role: "SECURITY", emp: "SEC001" },
    { email: "security2@campus.edu", name: "Suresh Yadav", role: "SECURITY", emp: "SEC002" },
    { email: "student1@campus.edu", name: "Arjun Mehta", role: "STUDENT", roll: "21BCS381", dept: "Computer Science", year: 3 },
    { email: "student2@campus.edu", name: "Sara Khan", role: "STUDENT", roll: "22MEC901", dept: "Mechanical", year: 2 },
    { email: "student3@campus.edu", name: "Kabir Malhotra", role: "STUDENT", roll: "21ECE881", dept: "Electronics", year: 3 },
    { email: "student4@campus.edu", name: "Ishaan Kapoor", role: "STUDENT", roll: "22CIV742", dept: "Civil", year: 2 },
    { email: "student5@campus.edu", name: "Priya Rao", role: "STUDENT", roll: "22BCS701", dept: "Computer Science", year: 2 },
    { email: "student6@campus.edu", name: "Rohan Joshi", role: "STUDENT", roll: "21MCS601", dept: "Mechanical", year: 3 },
    { email: "student7@campus.edu", name: "Ananya Desai", role: "STUDENT", roll: "22ECE502", dept: "Electronics", year: 2 },
    { email: "student8@campus.edu", name: "Aditya Nair", role: "STUDENT", roll: "21CIV403", dept: "Civil", year: 3 },
    { email: "student9@campus.edu", name: "Diya Sharma", role: "STUDENT", roll: "22BCS304", dept: "Computer Science", year: 2 },
    { email: "student10@campus.edu", name: "Vivek Gupta", role: "STUDENT", roll: "21MEC205", dept: "Mechanical", year: 3 },
  ];

  for (const user of expectedUsers) {
    // Check if auth user exists
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    const authUser = authData?.users.find((u) => u.email === user.email);

    if (!authUser) {
      console.log(`⚠️  Auth user not found: ${user.email}`);
      continue;
    }

    // Check if profile exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: authUser.id },
    });

    if (existingProfile) {
      console.log(`✓ Profile exists: ${user.email}`);
      continue;
    }

    // Create profile
    const profile = await prisma.profile.create({
      data: {
        userId: authUser.id,
        name: user.name,
        email: user.email,
        role: user.role as any,
        phone: "+91-9876543210",
        active: true,
      },
    });

    console.log(`✅ Created profile: ${user.name} (${user.role})`);

    // Create role-specific record
    if (user.role === "FACULTY") {
      await prisma.faculty.create({
        data: {
          profileId: profile.id,
          employeeId: `FAC${Math.random().toString().slice(2, 6)}`,
          department: user.dept,
        },
      });
    } else if (user.role === "WARDEN") {
      await prisma.warden.create({
        data: {
          profileId: profile.id,
          employeeId: `WRD${Math.random().toString().slice(2, 6)}`,
          hostelBlock: user.block,
        },
      });
    } else if (user.role === "SECURITY") {
      const mainGate = await prisma.gate.findFirst();
      await prisma.securityStaff.create({
        data: {
          profileId: profile.id,
          employeeId: user.emp!,
          gateId: mainGate?.id,
        },
      });
    } else if (user.role === "STUDENT") {
      await prisma.student.create({
        data: {
          profileId: profile.id,
          studentRoll: user.roll!,
          department: user.dept,
          year: user.year,
          section: "A",
          studentType: "DAY_SCHOLAR",
          status: "INSIDE",
        },
      });
    }
  }

  console.log("\n✅ Profile sync complete!");
}

main()
  .catch((e) => {
    console.error("❌ Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
