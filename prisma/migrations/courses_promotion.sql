-- Courses, yearly promotion and graduation (Admin → Promotion).
-- Adds new tables / empty columns only; existing rows are not changed.
-- Safe to run more than once. Run in the Supabase SQL editor BEFORE deploying.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "course" TEXT,
  ADD COLUMN IF NOT EXISTS "graduated_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "students_course_year_idx" ON "students" ("course", "year");

CREATE TABLE IF NOT EXISTS "courses" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "years" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "courses_code_key" ON "courses" ("code");

CREATE TABLE IF NOT EXISTS "promotion_batches" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "moved" INTEGER NOT NULL,
  "graduated" INTEGER NOT NULL,
  "before" JSONB NOT NULL,
  "undone_at" TIMESTAMP(3),
  CONSTRAINT "promotion_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "promotion_batches_created_at_idx" ON "promotion_batches" ("created_at" DESC);

-- Same as every other table: no access through the public API (the portal's server only)
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_batches" ENABLE ROW LEVEL SECURITY;
