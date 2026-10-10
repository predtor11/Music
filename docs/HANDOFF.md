# Handoff between Claude and Codex

Both sides read this file before starting and update it in every PR. Keep it
short and current. Rules are in [AGENTS.md](../AGENTS.md).

## Lanes

Fill in once, then keep to it. If a change needs a file in the other lane, write it under "Requests" below.

Phase 9 (More instruments, guitar first). **Design change (Jayesh, 2026-10-10):** the user picks an instrument first (piano, guitar, later others) and the whole app adapts to it: lessons, drills, practice views, input, progress and settings. Guitar is not a separate page; it is the second entry in an instrument registry. No file is in two lanes. Need a change in the other lane? Write it under "Requests".

| Side | Tasks | Folders and files (only these) |
| --- | --- | --- |
| Claude | **Instrument foundation (data and services):** `InstrumentId` and the `instrument` field on user settings, attempts, lessons and units; identity setting; per-instrument progress and practice (migrations); curriculum filtered by instrument. **Guitar theory:** tunings, fret maths, chord shapes, grading, guitar lessons and glossary | `packages/contracts/**`, `packages/theory/**`, `services/identity/**`, `services/practice/**`, `services/progress/**`, `services/curriculum/**`, `services/gateway/**`, `apps/api/**`, `docs/GUITAR.md`, `docs/INSTRUMENTS.md` (new) |
| Codex | **Instrument UI:** first-run instrument picker and a switcher in the header and settings; the instrument registry in the web app; every existing piano view moved behind a `piano` registry entry; the fretboard component, tap input and mic note detection as the `guitar` entry; the app shell reacting to the chosen instrument | `apps/web/**` (all of it this phase), `packages/pitch/**` (new package: mic pitch detection to a note number and cents), `apps/desktop/**` only if needed |

Shared files (`package-lock.json`, CI config, `packages/ui`, `packages/service-kit`) stay with Claude as owner; Codex requests changes under "Requests".

### The agreed seam (so neither side waits on the other)

Claude publishes these in `@music/contracts` and `@music/theory` in the first PR (the foundation PR); until it merges, Codex copies the shapes locally.

- `InstrumentId = 'piano' | 'guitar'` (more later). `UserSettings.instrument` (default `'piano'`), `Attempt.instrument` (default `'piano'`), optional `instrument` on lessons and units (missing means `'piano'`).
- Curriculum: `GET /curriculum/units?instrument=guitar` returns only that instrument's units. Progress report and skill scores take `?instrument=` and are kept separate per instrument.
- `FretPosition = { string: number; fret: number }` (string 1 is the thinnest, fret 0 is open), `GuitarTuning = { id; name; strings: number[] }` (MIDI per string, thickest first, standard is `[40, 45, 50, 55, 59, 64]`), `ChordShape = { name; frets: (number | null)[]; fingers: (number | null)[]; baseFret }`.
- Theory functions: `fretToMidi(tuning, pos)`, `midiToPositions(tuning, midi, maxFret)`, `chordShapeMidi(tuning, shape)`, `gradeGuitarAnswer(expected, played)`.
- The registry belongs to Codex, in `apps/web/src/instruments/`. Each entry has an id, a label, the input component (MIDI keyboard for piano, fretboard tap and mic for guitar), the visual component for lessons and drills, and the drill kinds it supports. All input ends up as MIDI note numbers or `FretPosition`s, graded in the browser with `@music/theory`. The app reads the chosen instrument from settings and renders the matching entry. Lesson steps that show keys ask the registry's visual for the current instrument.

## Per-phase workflow

Full rules are in [AGENTS.md](../AGENTS.md#per-phase-workflow). In short: lanes are written below before the phase starts, no file is in two lanes, shared files have one owner, each side rebases on the latest `main` before its PR, both review each other's PRs at phase end, then merge in the order below with green CI only.

Current phase: 9, More instruments, guitar first.

Shared-file owners (`packages/contracts`, `packages/service-kit`, `packages/ui`, `package-lock.json`, CI config): Claude owns all of them this phase. Codex asks under "Requests" (for example if `packages/pitch` needs a `packages/ui` token). A new package from Codex is allowed; Claude regenerates `package-lock.json` when merging.

Merge order for this phase:

1. The lanes PRs (#50 and the instrument design change).
2. Claude: foundation PR (contracts, theory guitar functions, identity setting, attempts and progress per instrument).
3. Codex: `packages/pitch`, then the instrument picker and registry with the piano entry, then the guitar entry (take new `main` in first).
4. Claude: guitar lessons, drills and glossary (needs a fretboard step kind agreed under "Requests").
5. Cross-review happens before each merge; only green CI merges. After each merge the next PR takes `main` in and CI runs again.

## In progress

| Side | Branch / PR | What | Files it touches |
| --- | --- | --- | --- |
| Claude | claude/phase9-guitar-unit-1 | Guitar unit 1 "Meet the fretboard" (5 lessons, checkpoint, glossary) and per-instrument unit numbering in the content loader | `services/curriculum/**`, `docs/GUITAR.md` |

## Recently changed

Newest first. One line each: date, side, PR, what.

- 2026-10-10 Claude: instrument foundation merged (#53); migration `003_instrument.sql` applied to Supabase.
- 2026-10-10 Claude: guitar contracts and theory functions merged (#51), see docs/GUITAR.md.
- 2026-10-10 Claude: instrument foundation (settings, curriculum filter, per-instrument attempts and progress); see docs/INSTRUMENTS.md. Codex: `UserSettings.instrument`, `Attempt.instrument` (send it with every attempt) and `?instrument=` on curriculum and progress calls are now available.
- 2026-10-10 Claude: guitar contracts and theory functions (tunings, fret maths, open chord shapes, grading) added; see docs/GUITAR.md.
- 2026-10-10 Claude: Phase 9 lanes written (guitar first, #50).
- 2026-10-10 Claude: added AGENTS.md and this file.

## Requests

Things one side needs from the other. Remove when done.

- **Claude to Codex (web, offline):** offline attempts must carry the instrument too. Set `instrument` wherever the web app builds an `Attempt` (`apps/web/src/lesson/usePractice.ts`, `apps/web/src/offline/**`), so the outbox and `sync.ts` send it. Offline lesson and unit caches should be keyed by instrument (`/units?instrument=`). The desktop app needs nothing extra: it uses the hosted API.
- **Deploy order for the instrument foundation:** apply migration `003_instrument.sql` (`npm run migrate -w @music/api` with `SUPABASE_DB_URL`) **before** merging it, because Vercel deploys main right away and the new code writes the `instrument` column. The migration only adds a column with a default, so the old code keeps working until then.
