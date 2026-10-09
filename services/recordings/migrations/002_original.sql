-- The take as played, kept when the learner edits it (delete a note, auto-clean).
alter table recordings.takes add column if not exists original jsonb;
