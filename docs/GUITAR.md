# Guitar (Phase 9b)

Guitar theory lives in `@music/theory` (`packages/theory/src/guitar`), the shared
shapes in `@music/contracts` (`guitar.ts`).

- String 1 is the thinnest string, fret 0 is open. A tuning lists the MIDI note of each string, thickest first. Standard is `[40, 45, 50, 55, 59, 64]`.
- `fretToMidi`, `midiToPositions`, `chordShapeMidi` do the fret maths. `OPEN_CHORD_SHAPES` holds the first eight open chords.
- `gradeGuitarAnswer(expected, played)` grades by MIDI note, so any correct fret on any string counts.
- Mic and tap input both end up as MIDI note numbers or fret positions, graded in the browser.

## Guitar lessons

`guitar-intro` ("Meet your guitar", 10 lessons and a 10-item checkpoint) is the first guitar unit. It starts with parts, posture and hand jobs, then a pick, open sounds, higher/lower sounds, reference tuning, fretting and a first tab line. `guitar-1` ("Meet the fretboard", 5 lessons and a 10-item checkpoint) is now unit 2; its id and all `g1-l*` lesson ids stay unchanged so saved progress remains valid. Units, lessons and test items use the same step and item kinds as piano: everything is MIDI notes, and the guitar view lights them with `midiToPositions`. Guitar content sets `"instrument": "guitar"` on the unit and its lessons; units are numbered 1, 2, 3 on their own for each instrument.

- Test items name a note with its octave when `midi` is set ("Play G3, the open G string."), or use `pc` for "any octave", or light the note ("Play the lit note.", with `showKeys: true`).
- New guitar words (string, fret, fretboard, open string, tuning, standard tuning) are in the shared glossary. General terms such as note, pitch, octave and half step are taught in the piano track; guitar lessons say them again in plain words. A guitar-only learner is not blocked, but an instrument-aware glossary is a later improvement.

## Introductory lesson format

- Each lesson includes explain, show, play-along, explore and quiz steps. The parts lesson explains one part per step, with its term in **bold**, a plain meaning and **Why it matters:**. Every introduced guitar term is in the glossary, linked to its earliest teaching lesson.
- Lessons pair each step with the playable fretboard. An optional additive `Lesson.guitarDiagram` (`parts` or `tab`) adds an accessible beginner picture throughout that lesson (generated labelled photograph for parts; six-line tab example for tab); older lessons and piano need no new field.
- Most checks ask a simple verbal question. Open-string and fretting checks use MIDI notes and `showKeys: true` on lit prompts; tap input and the existing optional monophonic microphone share browser grading.
- Reference tuning uses Hear it and the existing microphone tuner in the header. Check both the note letter and number, then the cents indication; a different note can also be “In tune”. Playback is excluded from microphone grading. Beginners should ask for help with tiny peg adjustments and never force a tight string.
- Guitar glossary ordering is checked within its own instrument. A **tuning peg** is taught as a physical part before **tuning** as an action. The guitar bridge uses glossary id `guitar-bridge` to distinguish it from a song’s bridge in band talk.

- Generated piano and guitar images also appear in the first-run picker and instrument settings. WebP assets ship through Vite with hashed URLs and the existing app precache; no third-party runtime image request is needed.
