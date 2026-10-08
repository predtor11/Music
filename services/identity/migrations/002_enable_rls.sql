-- Only this service (the database owner) reads these tables; nothing is exposed
-- through Supabase's public API.
alter table identity.profiles enable row level security;
alter table identity.schema_migrations enable row level security;
-- Supabase's API roles; plain Postgres (local tests) doesn't have them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA identity FROM anon, authenticated;
  END IF;
END $$;
