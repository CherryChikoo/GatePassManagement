import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking user accounts...\n");

  // Check if any profiles exist
  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  console.log(`Found ${profiles.length} profiles in database:\n`);

  if (profiles.length === 0) {
    console.log("❌ No profiles found! This explains the login error.");
    console.log("\nThe database was likely reset, but Supabase Auth users still exist.");
    console.log("You need to either:");
    console.log("  1. Delete Supabase Auth users and re-seed");
    console.log("  2. Or manually create profiles for existing auth users\n");
  } else {
    profiles.forEach((p) => {
      console.log(`${p.active ? "✅" : "❌"} ${p.role.padEnd(10)} - ${p.name.padEnd(25)} - ${p.email}`);
    });
    console.log(`\nChecking admin@campus.edu specifically...`);
    
    const admin = profiles.find(p => p.email === "admin@campus.edu");
    if (admin) {
      console.log(`✅ Admin profile exists: ${admin.name} (${admin.active ? "Active" : "Inactive"})`);
    } else {
      console.log(`❌ Admin profile NOT found in database`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
