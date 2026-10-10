# Agent guide (Claude, Codex, anyone else)

Short rules for every AI agent or person working in this repo. Details live in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (layout and code rules),
[docs/UI.md](docs/UI.md) (design system) and [docs/DEPLOY.md](docs/DEPLOY.md).
Read those first, then [docs/HANDOFF.md](docs/HANDOFF.md) to see what the other
side is doing.

## How we work together

- **Lanes.** Each side owns an area (see the table in `docs/HANDOFF.md`). Don't edit files in the other side's lane; ask for the change in HANDOFF.md.
- **Branches and PRs.** Work on your own branch cut from the latest `main`. Open a PR into `main`. Never push to `main` directly. Rebase or merge `main` in before opening the PR.
- **Review.** The other side reviews each PR. Only merge when CI is green and there are no conflicts; never merge red.
- **Handoff notes.** Update `docs/HANDOFF.md` in your PR: what you changed, what is in progress, what you need from the other side.
- **Push often.** Small PRs, pushed at regular intervals, not saved up.
- `package-lock.json` conflicts are expected. Regenerate with `npm install`, don't hand-merge.
- Shared packages (`packages/contracts`, `packages/service-kit`, `packages/ui`) change by PR with a note in HANDOFF.md, never silently.

## Before every push

```bash
npm run typecheck
npm test
npm run build
```

CI also runs `node scripts/check-path-case.mjs`, the Vercel build smoke test and the Playwright e2e tests (`npm run e2e`).

## Hard rules

- **Never commit secrets.** No keys, tokens, passwords or `.env` files, and don't paste them in PRs or chat. Secrets go in environment variables (`.env` locally, Vercel/GitHub secrets online). The Supabase anon key is the only key the browser may hold, and only for sign-in.
- **No file names that differ only by case.** Windows treats them as one file. CI enforces it.
- **Database (Supabase Postgres).** One schema per service, row level security on every table. Only the services talk to the DB, never the browser. Add a migration for every schema change; migrations are not run per request (`npm run migrate` with `SUPABASE_DB_URL`).
- **MIDI is graded in the browser.** Services never sit between a key press and its feedback.
- **Contracts first.** API bodies and events come from `@music/contracts`; validate input with the zod schemas.
- **Lesson content rule.** A test item that is not "name it" and whose prompt mentions a lit key must set `"showKeys": true` (`check-items` enforces it). The pace is slow and starts from the basics; every term gets a name, meaning and significance, and a term must not be used in a lesson before the glossary introduces it.
- **UI.** Use `@music/ui` (tokens, themes, motion). The virtual keyboard is central: lessons pair text with it.
- **Tests.** Add or update tests next to the code you change.

## PR format

Describe what a reader would see: a "Before:" paragraph, an "After:" paragraph, then a short "How". Keep the PR small and in your lane.
