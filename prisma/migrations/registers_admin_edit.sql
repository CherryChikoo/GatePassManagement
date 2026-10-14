-- Main Admin may edit and delete Security register records (register_entries).
--
-- The portal allows this only for the ADMIN role (src/server/actions/registers.ts);
-- Security, Head Security and the Supervisor still cannot change records.
-- Gate movements, approvals, passes and visitors stay permanent
-- (see registers_immutability.sql). Truncating the table is still blocked.
--
-- Idempotent. Apply with:
--   npx prisma db execute --file prisma/migrations/registers_admin_edit.sql --schema prisma/schema.prisma

drop trigger if exists gp_register_entries_immutable on public.register_entries;
