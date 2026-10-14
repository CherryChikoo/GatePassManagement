/**
 * Read-only: compares portal accounts (profiles) with Supabase Auth logins.
 *   npx tsx scripts/account-sync-report.ts
 */
export {};

process.loadEnvFile(".env");

async function main() {
  const { getSyncReport } = await import("../src/lib/accounts/sync");
  const r = await getSyncReport();
  console.log(`Supabase logins:   ${r.loginCount}`);
  console.log(`Portal accounts:   ${r.portalCount} (${r.archivedCount} archived for history)`);
  console.log(`In sync:           ${r.inSync ? "yes" : "NO"}`);
  for (const p of r.portalWithoutLogin) {
    console.log(`  portal account without login: ${p.email} (${p.role}${p.archived ? ", archived" : ""})`);
  }
  for (const l of r.loginWithoutPortal) {
    console.log(`  login without portal account:  ${l.email || l.id} (created ${l.createdAt})`);
  }
  for (const m of r.emailMismatch) {
    console.log(`  email differs: portal ${m.portalEmail} / login ${m.loginEmail}`);
  }
  const { prisma } = await import("../src/lib/db/prisma");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
