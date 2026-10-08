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
