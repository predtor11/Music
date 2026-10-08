-- Profiles for the identity service. The id is the Supabase Auth user id.
create schema if not exists identity;

create table if not exists identity.profiles (
  id uuid primary key,
  display_name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
