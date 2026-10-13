-- Additional indexes for cleanup queries and performance
-- Run this after initial migration

-- Index for permission cleanup queries (status + createdAt)
CREATE INDEX IF NOT EXISTS "idx_permissions_cleanup" 
ON "permissions" ("status", "created_at") 
WHERE "status" IN ('COMPLETED', 'EXPIRED', 'CANCELLED');

-- Index for movement cleanup queries (createdAt only)
CREATE INDEX IF NOT EXISTS "idx_movements_cleanup" 
ON "movements" ("created_at");

-- Index for QR credential cleanup (active + expiresAt)
CREATE INDEX IF NOT EXISTS "idx_qr_cleanup" 
ON "qr_credentials" ("active", "expires_at") 
WHERE "active" = false;

-- Index for daily dashboard stats (approvedAt for today's count)
CREATE INDEX IF NOT EXISTS "idx_permissions_approved_today" 
ON "permissions" ("approved_at") 
WHERE "approved_at" IS NOT NULL;

-- Index for daily dashboard stats (rejectedAt for today's count)
CREATE INDEX IF NOT EXISTS "idx_permissions_rejected_today" 
ON "permissions" ("rejected_at") 
WHERE "rejected_at" IS NOT NULL;

-- Index for student permission history with pagination
CREATE INDEX IF NOT EXISTS "idx_permissions_student_history" 
ON "permissions" ("student_id", "created_at" DESC);

-- Composite index for security log queries (type + createdAt)
CREATE INDEX IF NOT EXISTS "idx_movements_type_date" 
ON "movements" ("type", "created_at" DESC);

-- Index for admin user list queries with role filter
CREATE INDEX IF NOT EXISTS "idx_profiles_role_created" 
ON "profiles" ("role", "created_at" DESC);

-- ANALYZE tables to update query planner statistics
ANALYZE "permissions";
ANALYZE "movements";
ANALYZE "qr_credentials";
ANALYZE "profiles";

-- Vacuum to reclaim space (run periodically)
-- VACUUM ANALYZE "permissions";
-- VACUUM ANALYZE "movements";
