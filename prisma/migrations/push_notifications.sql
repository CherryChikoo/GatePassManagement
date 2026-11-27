-- Phone / desktop notifications (web push) and each person's mute choices.
-- New tables only; nothing existing changes. Safe to run more than once.
-- Run in the Supabase SQL editor BEFORE deploying (after notifications.sql).

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_profile_id_idx" ON "push_subscriptions" ("profile_id");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "profile_id" TEXT NOT NULL,
  "muted" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("profile_id"),
  CONSTRAINT "notification_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Same as every other table: no access through the public API (the portal's server only)
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
