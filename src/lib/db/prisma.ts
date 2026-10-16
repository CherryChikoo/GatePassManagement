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

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown handling
if (process.env.NODE_ENV === "production") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect();
  });
}

