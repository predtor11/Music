-- Only this service (the database owner) reads these tables; nothing is exposed
-- through Supabase's public API.
ALTER TABLE practice.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice.schema_migrations ENABLE ROW LEVEL SECURITY;
-- Supabase's API roles; plain Postgres (local tests) doesn't have them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA practice FROM anon, authenticated;
  END IF;
END $$;
