-- Faster "today" counts on the registers home (filters on kind + entry date).
-- Safe to run more than once.
CREATE INDEX IF NOT EXISTS "register_entries_kind_entry_date_idx" ON "register_entries" ("kind", "entry_date");
