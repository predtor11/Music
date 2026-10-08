-- Sessions and attempts for the practice service. Owned by this service only.
CREATE SCHEMA IF NOT EXISTS practice;

CREATE TABLE practice.sessions (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('lesson', 'checkpoint', 'review', 'free')),
  ref_id       text,
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  -- Items fixed when the session starts, so a curriculum edit can't change a running test.
  items        jsonb NOT NULL DEFAULT '[]',
  pass_percent numeric,
  passed       boolean
);
CREATE INDEX sessions_user_started ON practice.sessions (user_id, started_at DESC);

CREATE TABLE practice.attempts (
  id          uuid PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES practice.sessions (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  item_id     text NOT NULL,
  item_kind   text NOT NULL,
  skill       text NOT NULL,
  expected    integer[] NOT NULL,
  played      integer[] NOT NULL,
  correct     boolean NOT NULL,
  retried     boolean NOT NULL,
  mistake     text,
  time_ms     integer NOT NULL,
  played_at   timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  seq         bigserial
);
CREATE INDEX attempts_session ON practice.attempts (session_id, seq);
