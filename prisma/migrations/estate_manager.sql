-- Estate Manager login (Supabase → SQL Editor). Run as TWO separate queries, in order:
-- a new enum value cannot be used in the same transaction that adds it.

-- ── Query 1 ─────────────────────────────────────────────────
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ESTATE_MANAGER';

-- ── Query 2 ─────────────────────────────────────────────────
-- Live updates: the Estate Manager may also listen on the "gatepass-live" channel
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
      AND p.role::text IN ('SECURITY', 'ADMIN', 'SECURITY_SUPERVISOR', 'ESTATE_MANAGER')
  );
$$;

REVOKE ALL ON FUNCTION public.gatepass_is_gate_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gatepass_is_gate_staff() TO authenticated;
