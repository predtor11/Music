# Instruments

The learner picks an instrument first and the whole app follows it. Piano is the
default; guitar is the second. More come later (see [GUITAR.md](GUITAR.md) for guitar maths).

## Data and services (Claude lane)

- `InstrumentId` (`'piano' | 'guitar'`) and `instrumentOf(x)` live in `@music/contracts`. A missing instrument means piano everywhere, so old data and old clients keep working.
- **Settings:** `UserSettings.instrument`. Missing or `null` means the learner has not chosen yet: show the picker, behave as piano meanwhile. Saved with `PATCH /api/identity/me/settings`.
- **Curriculum:** units and lessons carry an optional `instrument`. `GET /api/curriculum/units?instrument=guitar` returns that instrument's units; without the query it returns all of them. Units unlock in order within one instrument.
- **Attempts:** `Attempt.instrument` (optional, piano when missing). The web app sets it from the chosen instrument.
- **Progress:** `GET /api/progress?instrument=`, `/review-queue?instrument=` and `/reports/weekly?instrument=` return that instrument's data (default piano). The practice streak counts any practice. Skill tags must be unique across instruments (for example `fret:E-string`, not `note:E`); the instrument of a skill is the instrument of the attempts that created it.
- **Database:** migration `003_instrument.sql` in `practice` and `progress`; run `npm run migrate` with `SUPABASE_DB_URL` after merging.

## Web app (Codex lane)

The registry in `apps/web/src/instruments/` maps an `InstrumentId` to its input component, its visual for lessons and drills, and the drill kinds it supports. See `docs/HANDOFF.md` for the seam.
