-- Parents / guardian on student accounts (fill the Visitors Book when they come to the gate).
-- Adds empty columns only; existing rows are not changed. Safe to run more than once.
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "father_name" TEXT,
  ADD COLUMN IF NOT EXISTS "father_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "mother_name" TEXT,
  ADD COLUMN IF NOT EXISTS "mother_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "guardian_name" TEXT,
  ADD COLUMN IF NOT EXISTS "guardian_relation" TEXT,
  ADD COLUMN IF NOT EXISTS "guardian_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "home_address" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_vehicle" TEXT;
