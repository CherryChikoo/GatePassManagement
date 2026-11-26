-- Civil Engineer and Civil Supervisor logins (Supabase → SQL Editor).
-- Run as TWO separate queries, in order: a new enum value cannot be used in
-- the same transaction that adds it. Safe to run more than once.

-- ── Query 1 ─────────────────────────────────────────────────
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CIVIL_ENGINEER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CIVIL_SUPERVISOR';

-- ── Query 2 ─────────────────────────────────────────────────
-- Live updates: the book checkers may also listen on the "gatepass-live" channel
CREATE OR REPLACE FUNCTION public.gatepass_is_gate_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p."userId" = auth.uid()::text
      AND p.active
      AND p.role::text IN ('SECURITY', 'ADMIN', 'SECURITY_SUPERVISOR', 'ESTATE_MANAGER', 'CIVIL_ENGINEER', 'CIVIL_SUPERVISOR')
  );
$$;

REVOKE ALL ON FUNCTION public.gatepass_is_gate_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gatepass_is_gate_staff() TO authenticated;
