-- ─────────────────────────────────────────────────────────────────────────────
-- Visitor / Admission self check-in with a QR code (2026-10-31).
--
-- The visitor scans the QR on Security's screen and fills the Visitors Book or
-- Admission Book form on their own phone. Security checks it, takes the photo
-- and accepts it (a normal visitor / Admission record is made and linked here)
-- or rejects it. Offices (Accounts, Exam cell…) get a printed QR poster that
-- visitors scan to record their visit and unlock their exit.
--
-- Adds two new tables; nothing existing is changed. Safe to run more than once.
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "poster_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "offices_poster_key_key" ON "offices"("poster_key");

CREATE TABLE IF NOT EXISTS "visit_requests" (
    "id" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "secret_hash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT NOT NULL,
    "host_profile_id" TEXT,
    "office_id" TEXT,
    "issued_by_id" TEXT,
    "gate" TEXT,
    "photo_url" TEXT,
    "reject_reason" TEXT,
    "decided_by_id" TEXT,
    "decided_by_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "outsider_id" TEXT,
    "register_entry_id" TEXT,
    "exit_unlocked_at" TIMESTAMP(3),
    "exit_unlock_method" TEXT,
    "office_visited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visit_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "visit_requests_secret_hash_key" ON "visit_requests"("secret_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "visit_requests_outsider_id_key" ON "visit_requests"("outsider_id");
CREATE UNIQUE INDEX IF NOT EXISTS "visit_requests_register_entry_id_key" ON "visit_requests"("register_entry_id");
CREATE INDEX IF NOT EXISTS "visit_requests_register_status_created_at_idx" ON "visit_requests"("register", "status", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_requests_host_profile_id_fkey') THEN
    ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_host_profile_id_fkey"
      FOREIGN KEY ("host_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_requests_office_id_fkey') THEN
    ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_office_id_fkey"
      FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_requests_issued_by_id_fkey') THEN
    ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_issued_by_id_fkey"
      FOREIGN KEY ("issued_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_requests_outsider_id_fkey') THEN
    ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_outsider_id_fkey"
      FOREIGN KEY ("outsider_id") REFERENCES "outsiders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_requests_register_entry_id_fkey') THEN
    ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_register_entry_id_fkey"
      FOREIGN KEY ("register_entry_id") REFERENCES "register_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Same protection as every other table (see enable_rls.sql): the app reads and
-- writes them only on the server; the public API roles get no access.
ALTER TABLE "offices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "offices" FROM anon, authenticated;
ALTER TABLE "visit_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "visit_requests" FROM anon, authenticated;

-- Verification:
-- SELECT count(*) FROM offices;
-- SELECT count(*) FROM visit_requests;
