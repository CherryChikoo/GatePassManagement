-- ─────────────────────────────────────────────────────────────────────────────
-- Live updates for the gate screens (Supabase Realtime, private broadcast).
--
-- The server sends tiny "this changed" pings (topic names only, never data) on
-- the private channel "gatepass-live" using the service key (src/lib/realtime/
-- notify.ts). Open Security / Admin / Supervisor screens listen and reload.
--
-- This policy lets ONLY active gate staff (Security, Main Admin, Security
-- Supervisor) listen. Nobody can send from the browser: there is no INSERT
-- policy, so only the server's service key can broadcast.
--
-- Until this is run, the portal works exactly as before, just without live
-- updates (screens still refresh when opened or when the tab is reopened).
--
-- Review, then run in the Supabase SQL editor. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- Is the signed-in user active gate staff? (profiles are not readable by the
-- API roles, so this runs with the owner's rights and returns only true/false.)
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
      AND p.role IN ('SECURITY', 'ADMIN', 'SECURITY_SUPERVISOR')
  );
$$;

REVOKE ALL ON FUNCTION public.gatepass_is_gate_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gatepass_is_gate_staff() TO authenticated;

DROP POLICY IF EXISTS "gatepass live: gate staff can listen" ON realtime.messages;
CREATE POLICY "gatepass live: gate staff can listen"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'gatepass-live'
    AND realtime.messages.extension = 'broadcast'
    AND public.gatepass_is_gate_staff()
  );

-- Own updates (added 2026-10-20): every signed-in user (students, faculty…)
-- may listen ONLY to their own topic "user:<their id>", where the server pings
-- "pass:<id>" when their pass is approved, rejected or scanned. Their pass
-- screen then updates at once instead of checking every few seconds.
DROP POLICY IF EXISTS "gatepass live: own updates" ON realtime.messages;
CREATE POLICY "gatepass live: own updates"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'user:' || auth.uid()::text
    AND realtime.messages.extension = 'broadcast'
  );

-- Verification (expect both policies):
-- SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages';
