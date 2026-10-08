# Practice service

Sessions and attempts. Port 4003, behind the gateway at `/api/practice`.
The web app grades MIDI in the browser and posts each result here.

| Route | What |
| --- | --- |
| `POST /sessions` `{ kind, refId? }` | Starts a session. `lesson` and `checkpoint` need `refId` (lesson id or unit id) and fix their items from the curriculum service at start. `review` and `free` have no items yet. |
| `GET /sessions/:id` | The session. |
| `GET /sessions/:id/next-item` | The first item with no attempt, or `null` when every item has one or the session has ended. |
| `POST /attempts` (`AttemptSchema`) | Stores the attempt and publishes `attempt.recorded`. 409 after the session ended; 400 for an item not in the session. |
| `POST /sessions/:id/end` | Scores the session and publishes `session.ended` once. Returns `{ session, summary }`. |

**Scoring.** Each item counts once, on its first attempt: right and not `retried`.
Unanswered items count as wrong. `passed` is first-try accuracy ≥ the unit's
`checkpoint.passPercent` for checkpoints, ≥ 80% for lessons, and `null` for
review and free sessions.

**Curriculum calls.** `GET {CURRICULUM_URL}/lessons/:id` and `GET {CURRICULUM_URL}/units/:id`
(unit including its checkpoint), 404 when unknown. `CURRICULUM_URL` defaults to
`http://localhost:4002`.

**Storage.** In memory unless `SUPABASE_DB_URL` is set; then Postgres, schema
`practice`, with `migrations/*.sql` applied at start-up. To run the tests
against Postgres too, set `PRACTICE_TEST_DB_URL` to a throwaway database.
