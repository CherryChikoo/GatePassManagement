import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Health check endpoint for monitoring
 * Returns 200 if all systems operational
 */
export async function GET() {
  const startTime = Date.now();
  
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        api: "operational",
      },
      responseTime: `${responseTime}ms`,
      version: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Database connection failed",
      },
      { status: 503 }
    );
  }
}

// Disable caching for health checks
export const dynamic = 'force-dynamic';
export const revalidate = 0;
