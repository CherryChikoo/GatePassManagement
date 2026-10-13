/**
 * Script to rename "Deputy Admin" to "HOD" in both:
 * 1. Supabase Auth user metadata (display name)
 * 2. Profile table in the database
 * 
 * Run with: npx tsx scripts/rename-deputy-to-hod.ts
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("🔄 Renaming 'Deputy Admin' → 'HOD' in Supabase & Database...\n");

  // Step 1: Find profiles with name "Deputy Admin" or role still set incorrectly
  const deputyProfiles = await prisma.profile.findMany({
    where: {
      OR: [
        { name: { contains: "Deputy Admin" } },
        { name: { contains: "deputy admin" } },
        { name: { contains: "Deputy" } },
      ],
    },
    include: { faculty: true },
  });

  console.log(`📋 Found ${deputyProfiles.length} profile(s) with "Deputy" in name.\n`);

  for (const profile of deputyProfiles) {
    console.log(`  🔹 Profile: ${profile.name} (${profile.email}) - Role: ${profile.role}`);

    // Update profile name in DB
    await prisma.profile.update({
      where: { id: profile.id },
      data: { 
        name: "HOD",
        role: "FACULTY_ADMIN",
      },
    });
    console.log(`  ✅ Updated profile name to "HOD" and role to "FACULTY_ADMIN"`);

    // Ensure Faculty record exists for the HOD
    if (!profile.faculty) {
      await prisma.faculty.create({
        data: {
          profileId: profile.id,
          employeeId: `HOD${Math.random().toString().slice(2, 6)}`,
          department: "Administration",
        },
      });
      console.log(`  ✅ Created Faculty record for HOD`);
    }

    // Update Supabase Auth user metadata
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUser = authData?.users.find(u => u.id === profile.userId);

    if (authUser) {
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...authUser.user_metadata,
          name: "HOD",
          full_name: "HOD",
          display_name: "HOD",
        },
      });

      if (error) {
        console.log(`  ❌ Failed to update auth metadata: ${error.message}`);
      } else {
        console.log(`  ✅ Updated Supabase Auth metadata to "HOD"`);
      }
    } else {
      console.log(`  ⚠️  No matching auth user found for userId: ${profile.userId}`);
    }

    console.log("");
  }

  // Step 2: Also check for any profiles with FACULTY_ADMIN role that might still have old names
  const facultyAdminProfiles = await prisma.profile.findMany({
    where: { role: "FACULTY_ADMIN" },
    include: { faculty: true },
  });

  console.log(`📋 Found ${facultyAdminProfiles.length} FACULTY_ADMIN profile(s) total.\n`);

  for (const profile of facultyAdminProfiles) {
    console.log(`  🔹 FACULTY_ADMIN: ${profile.name} (${profile.email})`);
    
    // Ensure Faculty record exists
    if (!profile.faculty) {
      await prisma.faculty.create({
        data: {
          profileId: profile.id,
          employeeId: `HOD${Math.random().toString().slice(2, 6)}`,
          department: "Administration",
        },
      });
      console.log(`  ✅ Created missing Faculty record`);
    } else {
      console.log(`  ✓ Faculty record exists`);
    }
  }

  console.log("\n✅ Rename complete! All 'Deputy Admin' references updated to 'HOD'.");
}

main()
  .catch((e) => {
    console.error("❌ Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
