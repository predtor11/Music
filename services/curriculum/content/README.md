# Lesson content

The course goes one idea per lesson, slowly, for a player who knows no theory.
The full unit-by-unit path is in the Claude Doc "Music Theory Trainer: Curriculum Path".

## Rules for every lesson

- Every new term gets an `explain` step with the term in **bold**, what it means,
  a `**Why it matters:**` line, and keys to light (`exampleMidi`, `labels`).
- Every term also gets an entry in `glossary.json` naming the lesson that teaches it.
- No lesson may use a glossary term before the lesson that teaches it. The tests check this.
- Every lesson has `explain`, `show`, `play-along`, `explore` and `quiz` steps.
- Every test item's answer is checked against `@music/theory` (`test/check-items.ts`).
  Add a check there when you add a new kind of question.

## Layout

- `units/<unit>.json`: the unit card and its checkpoint test.
- `lessons/<unit>/<lesson>.json`: one lesson.
- `glossary.json`: every term, in any order (the service sorts it into teaching order).

## Hand and finger sessions (technique/)

A separate track beside the units, open from the start: hand position and
finger training with an animated hand over the keyboard.

- `technique/sessions/<id>.json`: one session (`TechniqueSessionSchema` in `@music/contracts`).
  `explain` steps show the hands at rest and can carry a `demo` for the Watch button;
  `drill` steps list beats to play, each key with the hand and finger that plays it.
  A beat's `move` puts a hand in a new place first (thumb under, crossing over, a new shape).
- `technique/glossary.json`: the terms these sessions teach. `lessonId` names the session.
  Served at `GET /technique/glossary`, apart from the course glossary, so the two tracks
  never clash.
- Start-up refuses content where a finger isn't resting on the key it should play,
  or a hand's keys run the wrong way (right hand rises from the thumb, left hand falls).
- Keep every key between C3 and C5 (MIDI 48-72) so a 25-key keyboard can play it.
- The app hears keys, not fingers: drills guide the finger and check the key.
