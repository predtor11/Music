# Guitar (Phase 9)

Guitar theory lives in `@music/theory` (`packages/theory/src/guitar`), the shared
shapes in `@music/contracts` (`guitar.ts`).

- String 1 is the thinnest string, fret 0 is open. A tuning lists the MIDI note of each string, thickest first. Standard is `[40, 45, 50, 55, 59, 64]`.
- `fretToMidi`, `midiToPositions`, `chordShapeMidi` do the fret maths. `OPEN_CHORD_SHAPES` holds the first eight open chords.
- `gradeGuitarAnswer(expected, played)` grades by MIDI note, so any correct fret on any string counts.
- Mic and tap input both end up as MIDI note numbers or fret positions, graded in the browser.
