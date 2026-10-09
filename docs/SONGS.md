# Songs screen

`#/songs` opens a song and explains its chords in plain words.

- **Open a song.** Drop or choose a MIDI file (exact chords), or an audio file
  (.mp3, .wav, .m4a; the chords are a guess and the screen says so). "Try a
  sample song" opens the built-in 1-5-6-4 in G. Everything runs in the browser
  with `@music/analysis` (`analyzeMidiFile`, `analyzeAudio`, `analyzeNotes`);
  nothing is uploaded. The server's `POST /api/theory/analyze` stays for
  other callers.
- **Chord timeline.** Names, numbers (1, 5, 6m, 4) and sargam follow the
  note-name setting. Tap a chord to hear it, light it on the virtual keyboard
  and fix it (root, type, or one of the app's other guesses). Fixes use
  `withChord`; "Change key" uses `withKey`. Nothing is saved yet.
- **Loop A-B.** Move the slider, press "Start here" and "End here", then Play
  repeats that part. MIDI songs play through the app's piano; audio songs play
  the file itself.
- **Sections.** `src/songs/sections.ts` cuts the chord list into one go round
  of the repeating progression (or 4 chords) and writes one sentence for each:
  the numbers, how it ends, "the same as section 1", borrowed chords, unsure
  chords. "Loop this" loops a section.

Audio analysis is guess-level and has only been tested on synthetic sound.
