-- Notifications phase 3: timed alerts (visitor overstay, overdue passes, curfew,
-- morning summary, approver reminders, estate to-verify).
-- Safe to run more than once. Run in the Supabase SQL editor BEFORE deploying.

-- Part 1 — timing settings (one row, id 'default'; the app creates it when missing)
CREATE TABLE IF NOT EXISTS "notification_config" (
  "id" TEXT NOT NULL,
  "overstay_hours" INTEGER NOT NULL DEFAULT 3,
  "reminder_minutes" INTEGER NOT NULL DEFAULT 60,
  "curfew_time" TEXT NOT NULL DEFAULT '21:00',
  "summary_time" TEXT NOT NULL DEFAULT '08:00',
  "summaries_on" BOOLEAN NOT NULL DEFAULT true,
  "mentee_alerts_on" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_config_pkey" PRIMARY KEY ("id")
);
INSERT INTO "notification_config" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

-- Same as every other table: no access through the public API (the portal's server only)
ALTER TABLE "notification_config" ENABLE ROW LEVEL SECURITY;

-- Part 2 — run after replacing YOUR_SITE_URL (e.g. gatepass.example.com, no https://)
-- and YOUR_CRON_SECRET (the CRON_SECRET value set in Vercel).
-- Vercel's free plan only runs daily crons, so Supabase calls the portal every 5 minutes.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gatepass-notify-tick') THEN
    PERFORM cron.unschedule('gatepass-notify-tick');
  END IF;
END $$;

SELECT cron.schedule(
  'gatepass-notify-tick',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://YOUR_SITE_URL/api/cron/notify-tick',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) $$
);
