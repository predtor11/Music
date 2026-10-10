# Offline mode

After one online visit the web app opens and teaches with no internet, and
practice done offline is sent to the server later. Code lives in
`apps/web/src/offline`, `apps/web/sw/sw.js` and `apps/web/public`.

## What works offline

| | Offline |
| --- | --- |
| App shell, units, lessons, glossary, technique, band talk | Yes, once opened online (service worker). |
| Lessons and unit tests: questions, grading, next item, score | Yes. Needs the lesson or unit to have been loaded in this visit or saved by the service worker. |
| Review | No. The server picks its questions. |
| Progress report | Shows the last report that loaded, with a note. |
| Piano samples | They come from a CDN; offline the app falls back to the built-in synth. |

## Service worker

`vite build` writes `dist/sw.js` from `sw/sw.js` with the list of built files
(see `serviceWorker()` in `vite.config.ts`). It is registered only in
production builds, over http(s).

- Built files and the page: saved when the worker installs. Pages are
  network-first (a new version arrives as soon as there is one) and fall back to
  the saved page.
- `GET /api/curriculum/*`: stale-while-revalidate in the `music-curriculum-v1` cache.
- Nothing else under `/api` is cached. A request that carries an `Authorization`
  header or cookies is never cached, and neither is a response marked
  `private`/`no-store` or setting a cookie. The web client sends curriculum
  calls without the token for this reason (the course is the same for everyone).
- A new build gets a new shell cache; old ones are deleted on activate.

## Practice and the outbox

The client makes the ids: `CreateSession.id` and `Attempt.id`
(`crypto.randomUUID()`). The practice service stores a repeated id once, so any
operation can be sent again safely.

Every session start, attempt and session end is written to the **outbox**
(IndexedDB `music-outbox`; localStorage `music.outbox.v1` if IndexedDB is
missing; memory as a last resort) and then sent in the background by the sync
runner (`sync.ts`).

- **Order** is kept per session: create, attempts, end. A session that hit a
  retryable error waits; other sessions go on.
- **Done** means any 2xx. Network errors, 5xx, 408, 425 and 429 are retried with
  backoff (2 s doubling to 60 s), and straight away on the `online` event, on
  app start, when the tab is shown, on sign-in, and on a 60 s timer.
- **401** pauses the queue until sign-in. Nothing is dropped.
- **Other 4xx** will never succeed: the operation is logged (`console.warn`) and
  dropped. If a session's creation is refused, the rest of that session is
  dropped too.
- **Owners.** Operations are filed under the user id. Made while signed out
  (`anonymous`) they are not sent; the next account that signs in on this device
  claims them. Another account's operations are never sent with your token.
  With sign-in switched off (no Supabase env) everything belongs to `local`.

While operations are waiting, `next-item` and the end-of-session score come from
the lesson or unit in memory (`practice.ts`), using `scoring.ts`, a copy of
`services/practice/src/scoring.ts` plus `lessonItems`. `test/offline-scoring.test.ts`
runs both on all the course content so they can't drift. When the server's own
answer is available (everything sent), that one is used.

## What people see

- Header chip: Online, Offline, "N to sync", Syncing… (`SyncChip`).
- A lesson shows "Saved on this device" while its answers wait, or "Sign in to
  save your progress" when they wait for a sign-in.
- Progress shows "You're offline. Showing your report as last saved …".

## Testing

Unit: `test/outbox-sync.test.ts`, `test/offline-practice.test.ts`,
`test/offline-scoring.test.ts`, `test/progress-cache.test.ts`. e2e:
`e2e/offline.spec.ts` (uses `context.setOffline` plus `fakeApi().offline`,
because Playwright still answers routed requests while offline). The service
worker only runs in production builds, so it is checked against `vite build`
output by hand: load once, go offline, reload.
