-- Only this service (the database owner) reads these tables; nothing is exposed
-- through Supabase's public API.
ALTER TABLE progress.processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress.schema_migrations ENABLE ROW LEVEL SECURITY;
-- Supabase's API roles; plain Postgres (local tests) doesn't have them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA progress FROM anon, authenticated;
  END IF;
END $$;
