-- Notifications (bell + live alerts for every login). New table only; nothing
-- existing changes. Safe to run more than once. Run in the Supabase SQL editor
-- BEFORE deploying.

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'IMPORTANT',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "link" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_profile_id_dedupe_key_key" ON "notifications" ("profile_id", "dedupe_key");
CREATE INDEX IF NOT EXISTS "notifications_profile_id_created_at_idx" ON "notifications" ("profile_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_dedupe_key_idx" ON "notifications" ("dedupe_key");

-- Same as every other table: no access through the public API (the portal's server only)
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
