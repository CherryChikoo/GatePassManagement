import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Interactive transactions (gate scans, approvals, requests) hold a pooled
    // connection. At busy moments (morning exits, evening returns) give them
    // longer to get one and to finish, instead of failing with "unable to start
    // a transaction" (defaults: 2 s wait, 5 s run).
    transactionOptions: { maxWait: 8_000, timeout: 15_000 },
    // Production optimizations for high concurrency with Supabase pooler
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Busy moments (1000+ people at once): a brief connection hiccup or a full pool
// shouldn't reach the user as an error. Reads are retried once after a short
// pause. Writes and anything inside a transaction are never retried here (a
// retried write could be saved twice; they carry their own duplicate guards).
const TRANSIENT_DB_ERRORS = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const READ_ACTIONS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
]);
const RETRY_FLAG = Symbol.for("gatepass.prisma.readRetry");
const withFlag = prisma as unknown as Record<symbol, boolean>;
if (!withFlag[RETRY_FLAG]) {
  withFlag[RETRY_FLAG] = true;
  prisma.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (err: any) {
      if (params.runInTransaction || !READ_ACTIONS.has(params.action) || !TRANSIENT_DB_ERRORS.has(err?.code)) throw err;
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
      return next(params);
    }
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown handling
if (process.env.NODE_ENV === "production") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect();
  });
}

