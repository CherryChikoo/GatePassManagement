-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down Supabase's auto-generated REST/GraphQL API for application tables.
--
-- The app reads/writes these tables ONLY through Prisma on the server (it uses a
-- privileged database role that bypasses RLS). The browser must never be able to
-- query them with the public anon key. Enabling RLS with NO policies denies all
-- access for the `anon` and `authenticated` roles.
--
-- Review, then run in the Supabase SQL editor (or psql with DIRECT_DATABASE_URL).
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.faculty               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wardens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.security_staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_approvals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.qr_credentials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.outsiders             ENABLE ROW LEVEL SECURITY;  -- was missing

-- Defense in depth: remove direct table privileges from the public API roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- The photo bucket must stay private (served only via short-lived signed URLs).
UPDATE storage.buckets SET public = false WHERE id = 'exit-photos';

-- Verification queries (expect rls = true for every table, and no anon/authenticated grants):
-- SELECT relname AS table, relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
-- SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
-- SELECT id, public FROM storage.buckets;
