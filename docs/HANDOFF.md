# Handoff between Claude and Codex

Both sides read this file before starting and update it in every PR. Keep it
short and current. Rules are in [AGENTS.md](../AGENTS.md).

## Lanes

Fill in once, then keep to it. If a change needs a file in the other lane, write it under "Requests" below.

Phase 9 (More instruments, guitar first). No file is in two lanes. Need a change in the other lane? Write it under "Requests".

| Side | Tasks | Folders and files (only these) |
| --- | --- | --- |
| Claude | Guitar theory side: tunings, fret-to-note maths, chord shapes data, drills, grading logic, guitar lessons and glossary, the shared guitar types | `packages/theory/src/guitar/**` (new), `packages/theory/src/index.ts` (one export line), `packages/theory/test/guitar*`, `packages/contracts/src/guitar.ts` (new) and its export line, `services/curriculum/content/guitar/**` (new), `docs/GUITAR.md` (new) |
| Codex | Fretboard view and input: fretboard UI component, tap/click input, microphone note detection, the Guitar page and its route | `apps/web/src/fretboard/**` (new), `apps/web/src/guitar/**` (new, page and wiring), `apps/web/src/pages/Guitar*`, `apps/web/src/router.ts` and `apps/web/src/App.tsx` (add the route only), `packages/pitch/**` (new package: mic pitch detection to a note number and cents), `apps/web/test/**` for its own code |

### The agreed seam (so neither side waits on the other)

Claude publishes these in `packages/contracts/src/guitar.ts` in the first PR; Codex codes against them from the start (copy the shapes below locally until that PR merges):

- `FretPosition = { string: number; fret: number }`: string 1 is the thinnest, fret 0 is open.
- `GuitarTuning = { id: string; name: string; strings: number[] }`: MIDI note per string, thickest first. Standard is `[40, 45, 50, 55, 59, 64]`.
- `ChordShape = { name: string; frets: (number | null)[]; fingers: (number | null)[]; baseFret: number }`: `null` means muted.
- Theory functions in `@music/theory`: `fretToMidi(tuning, pos)`, `midiToPositions(tuning, midi, maxFret)`, `chordShapeMidi(tuning, shape)`, `gradeGuitarAnswer(expected, played)`.
- The `Fretboard` component (Codex) takes `positions` to light, `tuning`, `onPluck(pos)` and a `mic` option that reports MIDI note numbers. Mic and tap input both end up as MIDI note numbers or `FretPosition`s; grading happens in the browser with Claude's functions.

## Per-phase workflow

Full rules are in [AGENTS.md](../AGENTS.md#per-phase-workflow). In short: lanes are written below before the phase starts, no file is in two lanes, shared files have one owner, each side rebases on the latest `main` before its PR, both review each other's PRs at phase end, then merge in the order below with green CI only.

Current phase: 9, More instruments, guitar first.

Shared-file owners (`packages/contracts`, `packages/service-kit`, `packages/ui`, `package-lock.json`, CI config): Claude owns all of them this phase. Codex asks under "Requests" (for example if `packages/pitch` needs a `packages/ui` token). A new package from Codex is allowed; Claude regenerates `package-lock.json` when merging.

Merge order for this phase:

1. This lanes PR.
2. Claude: contracts and theory guitar functions (shared files first).
3. Codex: `packages/pitch`, then the fretboard component and Guitar page (take new `main` in first).
4. Claude: guitar lessons, drills and glossary.
5. Cross-review happens before each merge; only green CI merges. After each merge the next PR takes `main` in and CI runs again.

## In progress

| Side | Branch / PR | What | Files it touches |
| --- | --- | --- | --- |
| Claude | (this PR) | Phase 9 lanes | `docs/HANDOFF.md` |

## Recently changed

Newest first. One line each: date, side, PR, what.

- 2026-10-10 Claude: Phase 9 lanes written (guitar first).
- 2026-10-10 Claude: added AGENTS.md and this file.

## Requests

Things one side needs from the other. Remove when done.

- (none)
