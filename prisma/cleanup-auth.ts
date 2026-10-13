import { createClient } from "@supabase/supabase-js";

// Load from .env manually
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars: Record<string, string> = {};
envContent.split("\n").forEach((line: string) => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join("=").trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("🗑️  Cleaning up duplicate auth users...\n");

  const { data: authData } = await supabase.auth.admin.listUsers();
  
  // Find and delete student10 and student4 from Supabase Auth
  const toDelete = ['student4@campus.edu', 'student10@campus.edu'];
  
  for (const email of toDelete) {
    const authUser = authData?.users.find((u) => u.email === email);
    if (authUser) {
      await supabase.auth.admin.deleteUser(authUser.id);
      console.log(`✅ Deleted auth user: ${email}`);
    } else {
      console.log(`⚠️  Auth user not found: ${email}`);
    }
  }

  console.log("\n✅ Cleanup complete!");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  });
