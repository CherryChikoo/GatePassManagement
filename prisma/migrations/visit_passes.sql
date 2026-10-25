-- ─────────────────────────────────────────────────────────────────────────────
-- Meeting codes for visitors / admission people (2026-10-21).
--
-- When Security records a visitor (Visitors Book) or an Admission Book entry
-- for someone coming to meet a faculty / staff member, a 4-digit code is made
-- and shown to that person in their portal ("My visitors"). After the meeting
-- they tell the visitor the code; Security marks the exit only with it (or
-- Head Security / Main Admin let them out with a written reason).
--
-- Adds one new table; nothing existing is changed. Safe to run more than once.
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "visit_passes" (
    "id" TEXT NOT NULL,
    "outsider_id" TEXT,
    "register_entry_id" TEXT,
    "register" TEXT NOT NULL,
    "host_profile_id" TEXT NOT NULL,
    "host_name" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT,
    "purpose" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INSIDE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "met_at" TIMESTAMP(3),
    "exited_at" TIMESTAMP(3),
    "exit_method" TEXT,
    "override_reason" TEXT,
    "exited_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visit_passes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "visit_passes_outsider_id_key" ON "visit_passes"("outsider_id");
CREATE UNIQUE INDEX IF NOT EXISTS "visit_passes_register_entry_id_key" ON "visit_passes"("register_entry_id");
CREATE INDEX IF NOT EXISTS "visit_passes_host_profile_id_created_at_idx" ON "visit_passes"("host_profile_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "visit_passes_status_created_at_idx" ON "visit_passes"("status", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_passes_outsider_id_fkey') THEN
    ALTER TABLE "visit_passes" ADD CONSTRAINT "visit_passes_outsider_id_fkey"
      FOREIGN KEY ("outsider_id") REFERENCES "outsiders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_passes_register_entry_id_fkey') THEN
    ALTER TABLE "visit_passes" ADD CONSTRAINT "visit_passes_register_entry_id_fkey"
      FOREIGN KEY ("register_entry_id") REFERENCES "register_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_passes_host_profile_id_fkey') THEN
    ALTER TABLE "visit_passes" ADD CONSTRAINT "visit_passes_host_profile_id_fkey"
      FOREIGN KEY ("host_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Same protection as every other table (see enable_rls.sql): the app reads and
-- writes it only on the server; the public API roles get no access.
ALTER TABLE "visit_passes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "visit_passes" FROM anon, authenticated;

-- Verification:
-- SELECT count(*) FROM visit_passes;
