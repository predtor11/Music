-- Progress service tables. Everything lives in the "progress" schema; no
-- other service reads it.

create table progress.processed_events (
  event_id uuid primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create table progress.attempts (
  id uuid primary key,
  user_id uuid not null,
  session_id uuid not null,
  item_id text not null,
  item_kind text not null,
  skill text not null,
  expected int[] not null,
  played int[] not null,
  correct boolean not null,
  retried boolean not null,
  mistake text,
  time_ms int not null,
  played_at timestamptz not null
);
create index attempts_user_played_at on progress.attempts (user_id, played_at);

create table progress.skills (
  user_id uuid not null,
  skill text not null,
  attempts int not null,
  first_try_correct int not null,
  recent_times_ms int[] not null,
  ease double precision not null,
  interval_ms bigint not null,
  streak int not null,
  due_at timestamptz,
  last_scheduled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill)
);
create index skills_user_due_at on progress.skills (user_id, due_at);

create table progress.lessons (
  user_id uuid not null,
  lesson_id text not null,
  status text not null check (status in ('in-progress', 'done')),
  updated_at timestamptz not null,
  primary key (user_id, lesson_id)
);

create table progress.checkpoints (
  user_id uuid not null,
  unit_id text not null,
  passed_at timestamptz not null,
  primary key (user_id, unit_id)
);
