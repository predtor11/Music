-- Recordings for the recordings service. user_id is the Supabase Auth user id.
create schema if not exists recordings;

create table if not exists recordings.takes (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  source text not null,
  duration_ms integer not null,
  note_count integer not null,
  key_override text,
  take jsonb not null,
  corrections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists takes_user_created on recordings.takes (user_id, created_at desc);

-- Only this service (the database owner) reads these tables; nothing is exposed
-- through Supabase's public API.
alter table recordings.takes enable row level security;
alter table recordings.schema_migrations enable row level security;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA recordings FROM anon, authenticated;
  END IF;
END $$;
