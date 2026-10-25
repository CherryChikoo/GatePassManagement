/**
 * Read-only: which database queries cost the most time (Supabase's
 * pg_stat_statements), to find what to make faster on the free plan.
 *
 *   npx tsx --env-file=.env scripts/db-slow-queries.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT calls,
           round(total_exec_time::numeric, 0) AS total_ms,
           round(mean_exec_time::numeric, 1) AS mean_ms,
           round(max_exec_time::numeric, 0) AS max_ms,
           rows,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 230) AS query
    FROM extensions.pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat_statements%'
      AND query NOT ILIKE '%pg_catalog%'
      AND query NOT ILIKE '%information_schema%'
      AND (query ILIKE '%"public"%' OR query ILIKE '%public.%')
    ORDER BY total_exec_time DESC
    LIMIT 25`);
  for (const r of rows) {
    console.log(`${String(r.calls).padStart(7)} calls  total ${String(r.total_ms).padStart(8)} ms  avg ${String(r.mean_ms).padStart(7)} ms  max ${String(r.max_ms).padStart(6)} ms  | ${r.query}`);
  }
}

main()
  .catch((e) => console.error("failed:", e.message.split("\n").slice(-3).join(" ")))
  .finally(() => prisma.$disconnect());
