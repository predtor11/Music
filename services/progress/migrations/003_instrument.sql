-- Progress is kept per instrument. Existing rows are piano.
alter table progress.attempts add column if not exists instrument text not null default 'piano';
alter table progress.skills add column if not exists instrument text not null default 'piano';
create index if not exists attempts_user_instrument on progress.attempts (user_id, instrument, played_at);
