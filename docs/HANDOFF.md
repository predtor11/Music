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

## Phase 9b: complete guitar (Codex-led, Claude paused)

**Decision (Jayesh, 2026-10-10):** every instrument gets everything piano has, in every part of the app. Build it in phases if needed, but the plan lists all of it. For now Codex builds the rest of guitar and Claude builds nothing; Claude only reviews when asked and merges nothing.

**Lane for this work.** Because Claude is paused, Codex owns every folder it needs, shared ones included, until Jayesh says otherwise: `apps/web/**`, `apps/api/**`, `apps/desktop/**`, `packages/{contracts,theory,pitch,skills,analysis,charts,ui,service-kit}/**`, `services/**` (including `services/curriculum/content/**`), `docs/**`, `package-lock.json`, CI config. Rules that still hold:

- Work on `codex/...` branches from the latest `main`; one small PR per task below, in order; green CI only; update this file in every PR.
- Contract changes are additive only: new fields are optional and a missing `instrument` still means piano, so old clients, offline data and the live site keep working. Never rename or remove a field.
- Database change = a new migration file (never edit an applied one) and a note in the PR: **Jayesh must run `npm run migrate` before that PR is merged**, because Vercel deploys `main` at once.
- Lockfile: run `npm install` and commit `package-lock.json` yourself. Never hand-merge it.
- Lesson content rules from AGENTS.md stand (`showKeys`, glossary-before-use, slow pace, bold terms). `npm test` in `services/curriculum` enforces them; the guitar units in `services/curriculum/content/` follow the same file layout as `guitar-1`, and `docs/GUITAR.md` has the lesson format.
- Everything is graded in the browser from MIDI notes or `FretPosition`s, using `@music/theory` (`midiToPositions`, `fretToMidi`, `chordShapeMidi`, `gradeGuitarAnswer`).
- Every per-instrument feature reads the instrument from settings and filters on it: `?instrument=` on curriculum, practice, progress and recordings calls, and `instrument` on every attempt (offline queue included). Piano behaviour must not change.

**Every task has the same done-check:** `npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-path-case.mjs`, the Playwright e2e for the area (add or extend a spec in `apps/web/e2e/`), and a piano regression pass (existing specs still green).

### Guitar curriculum standard (Jayesh, 2026-10-10)

Guitar lessons start from the absolute basics, slow and term by term, exactly like piano. For a player who knows nothing: one idea per lesson; every new term gets an explain step with the term in **bold**, what it means and a `**Why it matters:**` line; every term is in `glossary.json` and is not used before the lesson that teaches it; every lesson pairs text with the fretboard (`showKeys` on any "lit" prompt) and has explain, show, play-along, explore and quiz steps; every unit ends in a checkpoint. See `services/curriculum/content/README.md` and the pace notes in `docs/GUITAR.md`.

**Existing `guitar-1` ("Meet the fretboard") is not gentle enough.** It starts straight at strings and frets and assumes the player already holds a guitar. Task 2 therefore begins with a new first unit before it (task 2a below). Keep the id `guitar-1` and its lesson ids as they are, because progress is stored by id; the new unit gets id `guitar-intro` and `order: 1`, and `guitar-1` becomes `order: 2` (the loader numbers `order` per instrument; the lock badge reads the order, never the id).

### Tasks, in order

1. **Unit-0 bug and instrument-safe progress.** Fixed in #56 (the hosted API dropped `instrument` from the progress catalog, so guitar looked locked). Check it is merged; then add an e2e in `apps/web/e2e/unlocks.spec.ts`: with guitar chosen, guitar-1 is open and its badge never mentions a unit that does not exist. In `LessonsPage.tsx` the lock badge must name the previous unit of the same instrument, or say nothing for the first unit. Relies on: `GET /progress?instrument=guitar`, `computeProgress` per instrument.
2a. **Unit `guitar-intro`, "Meet your guitar" (do this before everything else in task 2).** About 8 to 10 tiny lessons, no theory assumed: the parts of a guitar (body, neck, headstock, sound hole or pickups, bridge, tuning pegs; acoustic and electric), the guitar's six strings and the order they are numbered and named (thick to thin, E A D G B E, with a way to remember them), holding the guitar and sitting posture, the fretting hand and the picking hand (which does what), what a pick is and how to hold it, plucking one open string and hearing it, what makes a string higher or lower (thicker, tighter, shorter), what tuning means and tuning by ear against a reference note (use the mic tuner in `apps/web/src/guitar/tuner.ts`), pressing a string behind a fret without buzz, and reading a fretboard picture and a tab line. Terms for the glossary include: body, neck, headstock, bridge, tuning peg, pick, fretting hand, picking hand, pluck, tab. The existing guitar terms (string, fretboard, fret, open string, tuning, standard tuning) stay in `guitar-1`; if the new unit needs one earlier, move its teaching lesson into the intro and update `glossary.json` so the "not before taught" test still passes. Every lesson shows the fretboard or a guitar diagram with each step; checks are mostly "name it" and simple tap or mic checks, with `showKeys: true` where the prompt mentions a lit position. Done when `GET /units?instrument=guitar` lists `guitar-intro` first with the checkpoint, unit 2 (`guitar-1`) opens after it, and `services/curriculum` tests pass.
2. **Guitar curriculum, units 2 to 8** (mirrors piano: notes and steps, scales and keys, chords, chords in a key, seventh chords, voicing and inversions, rhythm and reading). Files: `services/curriculum/content/{units,lessons}/guitar-N*`, `glossary.json` (new terms only; reuse existing terms, do not redefine), `services/curriculum/test/*` counts. Each lesson has explain, show, play-along, explore and quiz; each unit has a checkpoint. Use fretboard positions (the same note in several places), open chord shapes from `OPEN_CHORD_SHAPES`, then barre chords, power chords and pentatonic and major scale boxes; add shapes to `packages/theory/src/guitar/chord-shapes.ts` with tests. Unit ids `guitar-N`, `order` counts per instrument (the loader already does this). Done when `GET /units?instrument=guitar` lists them in order and the first one needs nothing from piano.
3. **Hand and finger placement and movement** (piano has this under `services/curriculum/content/technique` and `apps/web/src/hands`). Guitar version: fretting-hand finger numbers (index 1 to little 4, thumb behind the neck), picking-hand fingers (p i m a), hand position by fret, shifting along the neck, finger-per-fret exercises, chord changes, string crossing. Add an optional `instrument` to technique sessions in `packages/contracts/src/technique.ts` and the loader, new guitar sessions, and a `HandOverlay` variant drawn on the fretboard (`apps/web/src/hands/`, `apps/web/src/fretboard/`). Grading checks the fret and string played; the app cannot see which finger was used, same as piano, so the overlay shows the finger and the check is on the position.
4. **Drills and daily practice.** `apps/web/src/daily/*` (plan, exercises, scoring) offers guitar exercises when guitar is chosen: open strings, notes on a string, fret-by-fret warm-up, chord-change speed, scale boxes at a tempo with the click. The daily plan, streak and storage are per instrument (key the local storage by instrument; the streak still counts any practice). Relies on `Attempt.instrument` and the skill tags (they must stay unique across instruments, prefix with `g:`).
5. **Review, skills and progress report.** Ensure review queue, skill scores, report (accuracy per topic, repeated mistakes, speed, suggestions) and the Progress page are instrument-scoped end to end; add guitar topic names and suggestions in `packages/analysis` and `packages/skills`. Services already filter on `?instrument=`; test the UI against a guitar-only history and a mixed history.
6. **Ear training.** `apps/web/src/ear/*`: for guitar, play the question on the fretboard (tap or mic) or choose from names; add intervals and chords by shape, and string-and-fret recognition. Audio uses the guitar timbre if available; if not, a plucked-string synth in `apps/web/src/audio/`.
7. **Reading and rhythm.** Notation and rhythm views (`apps/web/src/notation`, `apps/web/src/rhythm`) show guitar tab and standard notation (the guitar sounds an octave below written pitch); strumming patterns and tempo drills. Add a tab renderer; keep piano staff unchanged.
8. **Chords, charts and band talk.** `apps/web/src/chord`, `charts`, `bandtalk`, `ChordNamerPage`: chord diagrams for open and barre shapes, naming a shape you play on the fretboard, charts played with shapes, band-talk terms with guitar examples.
9. **Jam-along and progressions.** `apps/web/src/jam`: backing band plus guitar parts, play chord shapes along a progression, strum or pick, graded for chord tones.
10. **Pieces and songs.** `apps/web/src/pieces`, `songs`: practice mode with fret positions and finger hints; a starter set of guitar pieces; the piano roll becomes a tab roll for guitar.
11. **Recording.** `apps/web/src/record` and `services/recordings`: takes tagged with `instrument`, listed per instrument, note editor on the fretboard (mic recordings stay as notes). Needs a column on `recordings.takes`; add a migration, and tell Jayesh to run `npm run migrate` before merging.
12. **Offline and sync.** Guitar lessons and curriculum cached for offline, queued attempts and sessions carry `instrument`, drills and daily work offline; add cases to `apps/web/e2e/offline.spec.ts`.
13. **Desktop and settings parity.** Settings and the header switcher cover everything above (note names, sargam where it applies, tuning choice with drop D), and the desktop app online mode works with guitar data. No separate Guitar page anywhere.

If a task turns out larger than one PR, split it and keep the numbering (for example 2a, 2b). Record progress in "In progress" and "Recently changed" in this file. Claude reviews each PR on request: ask Jayesh to relay it.

## Per-phase workflow

Full rules are in [AGENTS.md](../AGENTS.md#per-phase-workflow). In short: lanes are written below before the phase starts, no file is in two lanes, shared files have one owner, each side rebases on the latest `main` before its PR, both review each other's PRs at phase end, then merge in the order below with green CI only.

Current phase: 9b, complete guitar. The Phase 9b lane and task order above supersede the original Phase 9 shared-file ownership and merge order below.

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
| Codex | codex/phase-9b-guitar-notes / PR pending | Task 2b: guitar-2, six notes/steps lessons and checkpoint; g: skill tags for attempts/review. #72 (split intro) is reviewed, merged and integrated. Next is guitar-3 scales/keys. | `services/curriculum/**`, `packages/skills/**`, `services/practice/{src/review.ts,test/review.test.ts}`, `apps/api/test/api.test.ts`, `apps/web/src/{lesson/usePractice.ts,pages/ReviewPage.tsx}`, `apps/web/e2e/guitar-notes.spec.ts`, `docs/**` |
| Claude | Paused for Phase 9b | Review Codex's small PRs when Jayesh relays them; no implementation or merges. | Review only |

## Recently changed

Newest first. One line each: date, side, PR, what.

- 2026-10-10 Codex (task 2b): added guitar-2 (order 3), six paced lessons and ten-question checkpoint covering note names, half/whole steps, sharps/flats and octaves. Reuses existing shared glossary definitions and explains each concept locally; removed a piano-knowledge assumption from g1-l3. Guitar attempts/review candidates now use g: skill tags, with unchanged piano tags. Added real-content fretboard grading/unlock e2e and mixed-skill review regression. Validation in progress; no migration. Claude: review lesson pacing, fret positions and skill isolation.
- 2026-10-10 Codex (#72): intro parts split into two lessons with separate quizzes; reviewed, merged and integrated. Typecheck, unit tests, build, path-case, 21 targeted browser checks and full CI passed; no migration.
- 2026-10-10 Codex (#63, Phase 9b task 2a): added `guitar-intro`, ten slow beginner lessons and a ten-question checkpoint before `guitar-1` (now order 2, existing IDs preserved). Moved the six existing guitar glossary introductions earlier and added fifteen beginner terms; corrected the inherited neck/fretboard wording without changing its lesson ID. Added optional `Lesson.guitarDiagram`, a generated labelled guitar anatomy photo and a first tab picture; generated piano/guitar art appears in the picker and settings. Images are bundled and cached with the app; real-content browser tests cover both themes, tap grading and checkpoint unlocks. Validation: typecheck, all unit tests, build, path-case and 26 targeted browser checks passed, including piano regressions. No migration.
- 2026-10-10 Codex (#58): task 1 reviewed by Claude and merged; instrument-safe prerequisite badges and guitar unlock coverage are on main.

- 2026-10-10 Claude (security review, PRs #59 headers, #60 API hardening, #61 input bounds, plus CI permissions and local bind): see `docs/SECURITY.md`. For Codex: services now listen on 127.0.0.1 unless `HOST` is set; attempt arrays and strings are capped (`expected` 128, `played` 512, `skill` 100, `timeMs` one day); a new external host (script, sounds, API) must be added to `CSP` in `apps/api/build.mjs` or the browser will block it.
- 2026-10-10 Codex (Phase 9b task 1): verified #56 is merged. Lock badges now use the preceding displayed unit of the same instrument and omit the badge for the first unit, even with stale progress; no arithmetic fallback to a nonexistent unit. Added guitar e2e coverage using the real per-instrument progress computation, a mixed catalog, non-consecutive unit orders and stale piano progress. Validation: root typecheck, unit tests, build and path-case passed; all 17 targeted instrument/unlock browser checks passed, including the existing piano regressions.
- 2026-10-10 Claude: fix for guitar lessons asking to "pass Unit 0": the hosted API's progress catalog dropped `instrument`, so guitar progress was empty and every guitar unit looked locked. Now passed through; test in `apps/api/test`.
- 2026-10-10 Claude (#55): guitar unit 1 "Meet the fretboard" (5 lessons, checkpoint, 6 glossary terms) and per-instrument unit numbering in the content loader; `GET /units?instrument=guitar` returns it.
- 2026-10-10 Codex (#54): fixed the CI auth assertion race: the sign-in redirect can fetch public curriculum before Account is opened, so API captures now include paths and the test deterministically checks anonymous curriculum reads alongside authenticated personal calls. All 84 browser tests passed locally before the assertion change; the strengthened auth case passed ten repeated runs. Typecheck, all 1,859 unit tests (ten optional skips) and build passed again; Claude UI/mic cross-review still needed.
- 2026-10-10 Codex (#54): addressed Claude’s three review blockers: latest main merged, nullable settings patches supported with shared InstrumentId, npm-regenerated pitch workspace lockfile entries added under Claude’s explicit authorization, and stale merged-PR handoff rows removed. Fresh npm ci, typecheck, 1,859 tests (10 optional skips), build and path-case passed; awaiting remote checks and the remaining UI/microphone/e2e cross-review.

- 2026-10-10 Codex (#54): merged foundation #53/main, resolved the handoff conflict, adopted the shared InstrumentId and handled nullable settings patches while keeping the active visual on piano by default. Typecheck, 1,859 unit tests (10 optional skips), build, path-case and Vercel smoke passed; all 16 auth/instrument browser checks passed. The frozen-install blocker was subsequently fixed with Claude’s authorization in the PR review comment.
- 2026-10-10 Claude: instrument foundation merged (#53); migration `003_instrument.sql` applied to Supabase.
- 2026-10-10 Claude: guitar contracts and theory functions merged (#51), see docs/GUITAR.md.
- 2026-10-10 Claude: instrument foundation (settings, curriculum filter, per-instrument attempts and progress); see docs/INSTRUMENTS.md. Codex: `UserSettings.instrument`, `Attempt.instrument` (send it with every attempt) and `?instrument=` on curriculum and progress calls are now available.
- 2026-10-10 Codex: implemented local monophonic pitch input with permission/cleanup tests; registered piano/guitar visuals and input, first-run selection, settings/header switching, instrument-scoped practice and progress. Reference playback pauses microphone grading. No standalone Guitar route. Typecheck, 1,854 unit tests (10 optional skips), build, path-case and Vercel smoke passed. Full browser run: 78 passed, six failed; all affected suites and the new instrument tests passed a stable 33-test rerun after session assertions were updated for the instrument field.

- 2026-10-10 Claude: guitar contracts and theory functions (tunings, fret maths, open chord shapes, grading) added; see docs/GUITAR.md.
- 2026-10-10 Claude: Phase 9 lanes written (guitar first, #50).
- 2026-10-10 Claude: added AGENTS.md and this file.

## Requests

Things one side needs from the other. Remove when done.

- Codex review of #60: read/write user limits share a counter; 121 reads consume the first write’s allowance. Reproduced locally and commented on #60. Claude: please split read/write buckets with a regression so loading piano lessons cannot block practice saves.

- Phase 9b: Jayesh, please relay the notes/steps PR for Claude to check pacing, position examples and g: skill isolation. No migration is needed. Task 2 continues one unit per PR, next guitar-3 (scales/keys); tasks 3–13 follow.
- **Deploy order for the instrument foundation:** apply migration `003_instrument.sql` (`npm run migrate -w @music/api` with `SUPABASE_DB_URL`) **before** merging it, because Vercel deploys main right away and the new code writes the `instrument` column. The migration only adds a column with a default, so the old code keeps working until then.
- Codex: foundation #53 is integrated. The UI sends `instrument: 'piano' | 'guitar'` on session creation and attempts, and `?instrument=guitar` for curriculum/progress/review/report reads. Piano uses the existing service defaults. Attempts and per-instrument caches are wired and validated against the merged contracts.
- Guitar lesson seam: existing `show.highlightMidi` and `explain.exampleMidi` steps now use the selected registry visual; guitar maps those MIDI notes to frets and carries captions and feedback marks. Existing note/chord items work through tap input; microphone input supports one note at a time. Use these existing step types for the first lessons, or propose any additional position-specific step contract here before adding it.
- Claude: please cross-review Codex's instrument UI and pitch changes once the PR is available, including the instrument filtering and microphone limitations.

- Claude: `CreateSessionSchema` still strips instrument and the practice review builder requests piano progress/queue. Preserve session instrument and pass it through review reads so guitar reviews cannot serve piano items. Please add a mixed-instrument review regression.
- Review concern for Claude: skill state is still keyed by user+skill, so the documented globally unique skill-tag convention is necessary. Either enforce that convention in curriculum loading or include instrument in repository keys and add a same-tag isolation test.
