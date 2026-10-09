# Daily practice

`#/daily` is a 10, 12 or 15 minute session for both hands, leaning on the left
(about 60/40, `leftShare` in `apps/web/src/daily/plan.ts`). Five blocks, two
rests. At each rest the app asks "Does it feel stiff?"; "stiff" or "it hurts"
lengthens the rest and eases the tempo for the rest of the day and the next
two days.

## What it measures

Only what a MIDI keyboard reports: when each key went down, its velocity, and
wrong or stray keys. Finger numbers are a guide shown by the animated hand,
never graded. There is no camera and no sensor.

| Mode      | You do                                    | Judged by                                                                 | Moves on when                                    |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Speed     | Play the pattern at a target tempo        | wrong keys, played tempo vs target                                        | a clean pass at pace: target goes up about 5%    |
| Control   | Play on a slow click                      | evenness of timing and of key velocity, wrong keys                        | score 80 or more with at most one slip           |
| Stability | Press a shape and hold it for N seconds   | no other key sounds, no key lifted early (`hold.ts`)                      | a perfect pass: the hold grows a second          |

Two clean-failing passes in a row lower the target a notch. Computer keys and
clicks have one fixed velocity, so touch evenness is only reported from a MIDI
keyboard. A finger that plays more than 15% softer than the hand's average is
named in the summary.

## What comes up

Rotating by day (`plan.ts`): the left hand's fingers 3 and 4 every day;
finger independence patterns; hand movement and jumping chords (including
boom-chick); chord shapes and inversions; progressions voiced smoothly in C, G,
F and D; note finding by name; mirror drills (both hands, same finger, opposite
directions). The summary links to Review for finished lessons.

## Where it is stored

In this browser (`music.daily.v1`), like the ear trainer's scores: tempo
reached per drill and mode, practice days and streak, each hand's seconds, and
stiffness answers. Nothing is sent to a server.
