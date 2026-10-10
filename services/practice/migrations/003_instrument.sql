-- Which instrument an attempt was played on. Existing rows are piano.
ALTER TABLE practice.attempts ADD COLUMN IF NOT EXISTS instrument text NOT NULL DEFAULT 'piano';
