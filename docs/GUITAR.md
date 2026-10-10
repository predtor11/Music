# Guitar (Phase 9b)

Guitar theory lives in `@music/theory` (`packages/theory/src/guitar`), the shared
shapes in `@music/contracts` (`guitar.ts`).

- String 1 is the thinnest string, fret 0 is open. A tuning lists the MIDI note of each string, thickest first. Standard is `[40, 45, 50, 55, 59, 64]`.
- `fretToMidi`, `midiToPositions`, `chordShapeMidi` do the fret maths. `OPEN_CHORD_SHAPES` holds the first eight open chords.
- `gradeGuitarAnswer(expected, played)` grades by MIDI note, so any correct fret on any string counts.
- Mic and tap input both end up as MIDI note numbers or fret positions, graded in the browser.

## Guitar lessons

`guitar-intro` ("Meet your guitar", 11 lessons and a 10-item checkpoint) is the first guitar unit. Its parts introduction is split into “The parts you hold” (`gi-l1`) and “The parts that make the sound” (`gi-l1b`), each with its own naming quiz. All previously published lesson IDs remain unchanged. It starts with parts, posture and hand jobs, then a pick, open sounds, higher/lower sounds, reference tuning, fretting and a first tab line. `guitar-1` ("Meet the fretboard", 5 lessons and a 10-item checkpoint) is now unit 2; its id and all `g1-l*` lesson ids stay unchanged so saved progress remains valid. Units, lessons and test items use the same step and item kinds as piano: everything is MIDI notes, and the guitar view lights them with `midiToPositions`. Guitar content sets `"instrument": "guitar"` on the unit and its lessons; units are numbered 1, 2, 3 on their own for each instrument.

- Test items name a note with its octave when `midi` is set ("Play G3, the open G string."), or use `pc` for "any octave", or light the note ("Play the lit note.", with `showKeys: true`).
- Guitar-specific terms are in the shared glossary. The guitar course explains shared concepts again in its own examples, in bold with a meaning and **Why it matters:**; it reuses their existing glossary definitions instead of adding duplicate entries. No piano completion is a prerequisite.

## Introductory lesson format

- Each lesson includes explain, show, play-along, explore and quiz steps. The parts lesson explains one part per step, with its term in **bold**, a plain meaning and **Why it matters:**. Every introduced guitar term is in the glossary, linked to its earliest teaching lesson.
- Lessons pair each step with the playable fretboard. An optional additive `Lesson.guitarDiagram` (`parts` or `tab`) adds an accessible beginner picture throughout that lesson (generated labelled photograph for parts; six-line tab example for tab); older lessons and piano need no new field.
- Most checks ask a simple verbal question. Open-string and fretting checks use MIDI notes and `showKeys: true` on lit prompts; tap input and the existing optional monophonic microphone share browser grading.
- Reference tuning uses Hear it and the existing microphone tuner in the header. Check both the note letter and number, then the cents indication; a different note can also be “In tune”. Playback is excluded from microphone grading. Beginners should ask for help with tiny peg adjustments and never force a tight string.
- Guitar glossary ordering is checked within its own instrument. A **tuning peg** is taught as a physical part before **tuning** as an action. The guitar bridge uses glossary id `guitar-bridge` to distinguish it from a song’s bridge in band talk.

- Generated piano and guitar images also appear in the first-run picker and instrument settings. WebP assets ship through Vite with hashed URLs and the existing app precache; no third-party runtime image request is needed.

## Notes and small steps (task 2b)

`guitar-2` is guitar Unit 3, after the intro and `guitar-1`. Six lessons cover note names/pitch, half steps, whole steps, sharps, flats and octaves; a ten-item checkpoint checks naming and playing. Questions accept any position for the exact MIDI sound, so alternate positions work but a different octave does not. All examples use the fretboard, and lit prompts carry `showKeys`.

Guitar attempts and review candidates use `g:` skill tags; piano tags keep their existing values. `skillFor(item, instrument)` defaults to piano for existing callers. Next curriculum PR: scales and keys (`guitar-3`); the remaining units follow the Phase 9b handoff.

### Scales and keys (task 2c)

`guitar-3` is guitar Unit 4. Nine small lessons move from an ordered scale to the major formula, tonic, key, natural minor, relative keys, five-note scales and compact routes. G major uses F sharp; A minor pentatonic uses A, C, D, E, G. The optional additive `Lesson.guitarPattern` stores string/fret positions in playing order and displays numbered tab beside every step. It suggests a route; scale grading checks pitch classes in order, accepting other octaves and positions. The major route stays at frets 2–5; the first pentatonic octave stays at frets 5–8. Existing lesson IDs and piano content are preserved.

### Starter chords (task 2d)

`guitar-4` is guitar Unit 5. Twenty small lessons teach chord, triad, root, major, minor and written chord symbols separately before eight open shapes: Em, E, Am, C, G, A, D and Dm. Optional `Lesson.guitarChord` names a canonical `GUITAR_CHORD_SHAPES` entry; content loading refuses unknown names. A diagram is shown beside each step, thick string 6 on the left, with dots for pressed frets, 0 for open and x for strings to leave out. The guide omits finger numbers until hand training teaches them. Tap positions remain selected so chords can sound together; Escape clears them. The microphone hears one note at a time and cannot complete simultaneous chord checks. The grader accepts the correct pitch classes in any positions or octaves; the diagram is a suggested shape. A, D and Dm extend the existing unit and its checkpoint while preserving published lesson/item IDs. Six further lessons teach the perfect fifth, G5/A5 power shapes and F/Fm/Bm barre shapes. `POWER_CHORD_SHAPES` and `BARRE_CHORD_SHAPES` use absolute fret numbers; `GUITAR_CHORD_SHAPES` joins these with the unchanged eight open shapes for lesson lookup. A repeated finger at one fret draws a band across the appropriate strings: six for F/Fm, five for Bm. The guide shows actual fret numbers even when it starts at fret 2 or 5. Existing power-chord Band Talk wording and examples are retained through a glossary link. Twenty lessons and the 28-question checkpoint preserve every published ID. Units guitar-6 through guitar-8 remain in task 2.

### Chords in a key (task 2g)

`guitar-5` is guitar Unit 6. Twelve short lessons teach diatonic chords, scale degrees, diminished triads, the major-key chord pattern, Roman and Nashville numbers, chord order, I–IV–V–I, I–V–vi–IV, ii–V–I, bars and a basic twelve-bar blues. It reuses shared glossary definitions and existing browser progression grading; no piano completion is needed. The twelve-question checkpoint checks real notes and chord sequences. Each correct tapped chord clears before the next, including consecutive repeated chords. Any correct positions or octaves count. Counting is explained but timing is not graded. Key-function names (primary, dominant and subdominant) and transposition remain for a small follow-up before this unit reaches full piano parity.
