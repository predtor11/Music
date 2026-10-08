# Practice service

Sessions and attempts. Port 4003, behind the gateway at `/api/practice`.
The web app grades MIDI in the browser and posts each result here.

| Route | What |
| --- | --- |
| `POST /sessions` `{ kind, refId? }` | Starts a session. `lesson` and `checkpoint` need `refId` (lesson id or unit id) and fix their items from the curriculum service at start. `review` picks about 10 items for the skills due in the progress service's review queue (see below). `free` has no items. |
| `GET /sessions/:id` | The session. |
| `GET /sessions/:id/next-item` | The first item with no attempt, or `null` when every item has one or the session has ended. |
| `POST /attempts` (`AttemptSchema`) | Stores the attempt and publishes `attempt.recorded`. 409 after the session ended; 400 for an item not in the session. |
| `POST /sessions/:id/end` | Scores the session and publishes `session.ended` once. Returns `{ session, summary }`. |

**Scoring.** Each item counts once, on its first attempt: right and not `retried`.
Unanswered items count as wrong. `passed` is first-try accuracy ≥ the unit's
`checkpoint.passPercent` for checkpoints, ≥ 80% for lessons, and `null` for
review and free sessions.

**Review sessions.** The service asks the progress service (`PROGRESS_URL`, default
`http://localhost:4004`, passing `x-user-id`) for `GET /review-queue` and `GET /`.
Items come only from lessons the learner has finished or started and checkpoints
they passed, so a review never uses a term before it is taught. Each item is
tagged with `skillFor` from `@music/skills` (the same tag the web app sends with
attempts) and matched to the due skills: weakest first-try accuracy first, then
longest overdue, one item per skill per round, quiz and checkpoint items before
play-along ones. Nothing due means a session with no items.

**Events.** Published on Redis Streams when `REDIS_URL` is set (in memory otherwise),
so `attempt.recorded` and `session.ended` reach the progress service.

**Curriculum calls.** `GET {CURRICULUM_URL}/lessons/:id` and `GET {CURRICULUM_URL}/units/:id`
(unit including its checkpoint), 404 when unknown. `CURRICULUM_URL` defaults to
`http://localhost:4002`.

**Storage.** In memory unless `SUPABASE_DB_URL` is set; then Postgres, schema
`practice`, with `migrations/*.sql` applied at start-up. To run the tests
against Postgres too, set `PRACTICE_TEST_DB_URL` to a throwaway database.
