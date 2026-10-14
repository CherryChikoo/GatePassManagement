/**
 * Removes portal accounts that have NO Supabase Auth login (e.g. rows created by
 * prisma/seed-bulk.ts with userId "fake-auth-*"). Real accounts — profiles whose
 * userId exists in Supabase Auth — are never touched.
 *
 * Usage:
 *   npx tsx scripts/remove-orphan-accounts.ts                      # dry run (default, no changes)
 *   npx tsx scripts/remove-orphan-accounts.ts --execute --expect=N # delete; N must equal the dry-run count
 *
 * Deletes, for orphan accounts only: their passes (with QR credentials and
 * approvals), gate movements, and role records; unlinks real students/approvals
 * that pointed at deleted faculty/wardens. Outsider (visitor) records are untouched.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// Load .env (Node ≥ 20.12 built-in; no extra dependency)
try {
  (process as any).loadEnvFile?.(".env");
} catch {
  // variables may already be set in the environment
}

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const expectArg = args.find((a) => a.startsWith("--expect="));
const EXPECTED = expectArg ? Number(expectArg.split("=")[1]) : NaN;

async function listAllAuthUserIds(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env");

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const ids = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list Supabase Auth users: ${error.message}`);
    data.users.forEach((u) => ids.add(u.id));
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function main() {
  const authIds = await listAllAuthUserIds();
  if (authIds.size === 0) {
    throw new Error("Supabase Auth returned 0 users — refusing to continue (would delete everything).");
  }

  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      userId: true,
      role: true,
      email: true,
      student: { select: { id: true } },
      faculty: { select: { id: true } },
      warden: { select: { id: true } },
      securityStaff: { select: { id: true } },
    },
  });

  const keep = profiles.filter((p) => authIds.has(p.userId));
  const orphans = profiles.filter((p) => !authIds.has(p.userId));

  const orphanProfileIds = orphans.map((p) => p.id);
  const studentIds = orphans.flatMap((p) => (p.student ? [p.student.id] : []));
  const facultyIds = orphans.flatMap((p) => (p.faculty ? [p.faculty.id] : []));
  const wardenIds = orphans.flatMap((p) => (p.warden ? [p.warden.id] : []));
  const securityIds = orphans.flatMap((p) => (p.securityStaff ? [p.securityStaff.id] : []));

  const permWhere = { OR: [{ studentId: { in: studentIds } }, { facultyId: { in: facultyIds } }] };
  const orphanPermIds = (await prisma.permission.findMany({ where: permWhere, select: { id: true } })).map((p) => p.id);
  const movementWhere = {
    OR: [
      { permissionId: { in: orphanPermIds } },
      { studentId: { in: studentIds } },
      { facultyId: { in: facultyIds } },
      { securityUserId: { in: securityIds } },
    ],
  };

  const [movementCount, linkedRealStudents, linkedApprovals] = await Promise.all([
    prisma.movement.count({ where: movementWhere }),
    prisma.student.count({
      where: {
        id: { notIn: studentIds },
        OR: [{ facultyId: { in: facultyIds } }, { wardenId: { in: wardenIds } }],
      },
    }),
    prisma.permissionApproval.count({
      where: {
        permissionId: { notIn: orphanPermIds },
        OR: [{ facultyId: { in: facultyIds } }, { wardenId: { in: wardenIds } }],
      },
    }),
  ]);

  const byRole = (list: typeof profiles) =>
    Object.entries(
      list.reduce<Record<string, number>>((acc, p) => ((acc[p.role] = (acc[p.role] || 0) + 1), acc), {})
    )
      .map(([r, n]) => `${r}: ${n}`)
      .join(", ") || "none";

  console.log("──────── Account cleanup ────────");
  console.log(`Supabase Auth users:            ${authIds.size}`);
  console.log(`Portal profiles (total):        ${profiles.length}`);
  console.log(`KEEP  (have an Auth login):     ${keep.length}  [${byRole(keep)}]`);
  console.log(`DELETE (no Auth login):         ${orphans.length}  [${byRole(orphans)}]`);
  console.log(`  passes to delete:             ${orphanPermIds.length} (+ their QR credentials and approvals)`);
  console.log(`  gate movements to delete:     ${movementCount}`);
  console.log(`  real students to unlink:      ${linkedRealStudents} (assigned to a deleted faculty/warden)`);
  console.log(`  real approvals to unlink:     ${linkedApprovals}`);
  const authWithoutProfile = [...authIds].filter((id) => !profiles.some((p) => p.userId === id)).length;
  if (authWithoutProfile > 0) {
    console.log(`Note: ${authWithoutProfile} Auth user(s) have no portal profile (cannot use the portal).`);
  }
  console.log("Sample of accounts to delete:", orphans.slice(0, 5).map((p) => p.email).join(", ") || "-");

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing was changed.");
    console.log(`To delete, run:  npx tsx scripts/remove-orphan-accounts.ts --execute --expect=${orphans.length}`);
    return;
  }

  if (orphans.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }
  if (EXPECTED !== orphans.length) {
    throw new Error(`--expect=${expectArg ? EXPECTED : "?"} does not match ${orphans.length} accounts to delete. Aborting.`);
  }

  console.log("\nDeleting…");
  await prisma.$transaction(
    async (tx) => {
      const mv = await tx.movement.deleteMany({ where: movementWhere });
      // QR credentials and approvals of these passes cascade with the permission
      const perms = await tx.permission.deleteMany({ where: { id: { in: orphanPermIds } } });
      await tx.permissionApproval.updateMany({ where: { facultyId: { in: facultyIds } }, data: { facultyId: null } });
      await tx.permissionApproval.updateMany({ where: { wardenId: { in: wardenIds } }, data: { wardenId: null } });
      await tx.student.updateMany({ where: { facultyId: { in: facultyIds } }, data: { facultyId: null } });
      await tx.student.updateMany({ where: { wardenId: { in: wardenIds } }, data: { wardenId: null } });
      // Student / faculty / warden / security rows cascade with the profile
      const prof = await tx.profile.deleteMany({ where: { id: { in: orphanProfileIds } } });
      console.log(`Deleted: ${prof.count} accounts, ${perms.count} passes, ${mv.count} gate movements.`);
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  const remaining = await prisma.profile.count();
  console.log(`✅ Done. Portal accounts remaining: ${remaining}`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
