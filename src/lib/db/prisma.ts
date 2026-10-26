import { PrismaClient } from "@prisma/client";

/**
 * After the portal sits idle, the network can silently drop the pooled
 * connection; the next query would then wait on a dead socket with no limit
 * (screens stuck loading). socket_timeout makes it fail after 20 s instead —
 * reads are then retried once on a fresh connection (below).
 */
function withSocketTimeout(url: string | undefined): string | undefined {
  if (!url || /[?&]socket_timeout=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}socket_timeout=20`;
}

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
        url: withSocketTimeout(process.env.DATABASE_URL),
      },
    },
  });

// After a quiet spell (no queries for a few minutes: portal left open, a paused
// server instance, a sleeping laptop) the pooled connections are often dead
// without the server knowing, and the next query would hang on one. So the
// first query after such a pause reconnects first (~0.3 s, once) instead.
const IDLE_RESET_MS = 4 * 60_000;
const IDLE_FLAG = Symbol.for("gatepass.prisma.idleReset");
const withIdleFlag = prisma as unknown as Record<symbol, boolean>;
if (!withIdleFlag[IDLE_FLAG]) {
  withIdleFlag[IDLE_FLAG] = true;
  let lastActivity = Date.now();
  let inFlight = 0;
  let resetting: Promise<void> | null = null;
  prisma.$use(async (params, next) => {
    // Only between requests (nothing running), never inside a transaction
    if (!params.runInTransaction && inFlight === 0 && !resetting && Date.now() - lastActivity > IDLE_RESET_MS) {
      resetting = prisma
        .$disconnect()
        .catch(() => {})
        .finally(() => {
          resetting = null;
        });
    }
    if (resetting) await resetting;
    inFlight++;
    try {
      return await next(params);
    } finally {
      inFlight--;
      lastActivity = Date.now();
    }
  });
}

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

