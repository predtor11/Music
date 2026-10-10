# Guitar (Phase 9)

Guitar theory lives in `@music/theory` (`packages/theory/src/guitar`), the shared
shapes in `@music/contracts` (`guitar.ts`).

- String 1 is the thinnest string, fret 0 is open. A tuning lists the MIDI note of each string, thickest first. Standard is `[40, 45, 50, 55, 59, 64]`.
- `fretToMidi`, `midiToPositions`, `chordShapeMidi` do the fret maths. `OPEN_CHORD_SHAPES` holds the first eight open chords.
- `gradeGuitarAnswer(expected, played)` grades by MIDI note, so any correct fret on any string counts.
- Mic and tap input both end up as MIDI note numbers or fret positions, graded in the browser.

## Guitar lessons

`guitar-1` ("Meet the fretboard", 5 lessons and a 10-item checkpoint) is the first guitar unit. Units, lessons and test items use the same step and item kinds as piano: everything is MIDI notes, and the guitar view lights them with `midiToPositions`. Guitar content sets `"instrument": "guitar"` on the unit and its lessons; units are numbered 1, 2, 3 on their own for each instrument.

- Test items name a note with its octave when `midi` is set ("Play G3, the open G string."), or use `pc` for "any octave", or light the note ("Play the lit note.", with `showKeys: true`).
- New guitar words (string, fret, fretboard, open string, tuning, standard tuning) are in the shared glossary. General terms such as note, pitch, octave and half step are taught in the piano track; guitar lessons say them again in plain words. A guitar-only learner is not blocked, but an instrument-aware glossary is a later improvement.
