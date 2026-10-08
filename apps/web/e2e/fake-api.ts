import type { Lesson, Unit } from '@music/contracts';
import type { Page, Route } from '@playwright/test';

/** A small lesson that uses every step type the player supports. */
export const LESSON: Lesson & { steps: Array<Lesson['steps'][number] & { labels?: Record<string, string> }> } = {
  id: 'test-l1',
  unitId: 'test-unit',
  order: 1,
  title: 'Finding C and D',
  summary: 'Test lesson.',
  minutes: 3,
  steps: [
    { type: 'explain', title: 'Two black keys', body: 'C sits just **left** of the two black keys.', exampleMidi: [60, 62], labels: { '60': 'C', '62': 'D' } },
    { type: 'show', title: 'Here is C', body: 'Every C looks the same.', highlightMidi: [48, 60, 72] },
    {
      type: 'play-along',
      title: 'Play some notes',
      items: [
        { kind: 'find-note', id: 'p1', prompt: 'Play any D.', pc: 2 },
        { kind: 'play-interval', id: 'p2', prompt: 'Play C4, then a whole step up.', startMidi: 60, semitones: 2 },
      ],
    },
    { type: 'explore', title: 'Free play', body: 'Play anything.' },
    {
      type: 'quiz',
      title: 'Quick check',
      items: [
        { kind: 'build-chord', id: 'q1', prompt: 'Play a C major chord.', pitchClasses: [0, 4, 7], bassPc: null },
        { kind: 'name-it', id: 'q2', prompt: 'Which key is lit?', shownMidi: [62], choices: ['C', 'D', 'E'], answer: 'D' },
      ],
    },
  ],
};

export const UNIT: Unit = {
  id: 'test-unit',
  order: 1,
  title: 'The keyboard map',
  summary: 'Test unit.',
  outcome: 'You can find C and D.',
  lessonIds: ['test-l1'],
  checkpoint: {
    passPercent: 80,
    items: [
      { kind: 'find-note', id: 'cp1', prompt: 'Play middle C.', midi: 60 },
      { kind: 'find-note', id: 'cp2', prompt: 'Play any E.', pc: 4 },
    ],
  },
};

export interface FakeApi {
  attempts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  ended: string[];
}

export const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '00000000-0000-4000-8000-000000000001';

/** Answers /api like the gateway would, and records what the app sends. */
export async function fakeApi(page: Page, { practiceDown = false, practiceNeedsSignIn = false } = {}): Promise<FakeApi> {
  const api: FakeApi = { attempts: [], sessions: [], ended: [] };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const session = (kind: string, refId?: string) => ({ id: SESSION_ID, userId: USER_ID, kind, refId: refId ?? null, startedAt: new Date().toISOString(), endedAt: null });

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();

    if (path === '/curriculum/units') return json(route, [{ ...UNIT, checkpoint: undefined }]);
    if (path === `/curriculum/units/${UNIT.id}`) return json(route, UNIT);
    if (path === `/curriculum/lessons/${LESSON.id}`) return json(route, LESSON);

    if (path.startsWith('/practice') && practiceDown) return route.abort('connectionrefused');
    // What the gateway and practice service do for a signed-out request when auth is on.
    if (path.startsWith('/practice') && practiceNeedsSignIn && !route.request().headers().authorization) {
      return json(route, { statusCode: 401, error: 'Unauthorized', message: 'sign in required' }, 401);
    }
    if (path === '/practice/sessions' && method === 'POST') {
      const body = route.request().postDataJSON() as { kind: string; refId?: string };
      api.sessions.push(body);
      return json(route, session(body.kind, body.refId), 201);
    }
    if (path === '/practice/attempts' && method === 'POST') {
      api.attempts.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, {}, 201);
    }
    if (path === `/practice/sessions/${SESSION_ID}/next-item`) {
      const answered = new Set(api.attempts.map((a) => a.itemId));
      return json(route, UNIT.checkpoint.items.find((i) => !answered.has(i.id)) ?? null);
    }
    if (path === `/practice/sessions/${SESSION_ID}/end` && method === 'POST') {
      api.ended.push(SESSION_ID);
      const first = new Map<unknown, Record<string, unknown>>();
      for (const a of api.attempts) if (!first.has(a.itemId)) first.set(a.itemId, a);
      const kind = api.sessions.at(-1)!.kind as string;
      const total = kind === 'checkpoint' ? UNIT.checkpoint.items.length : kind === 'review' ? first.size : 4;
      const firstTryCorrect = [...first.values()].filter((a) => a.correct && !a.retried).length;
      const accuracy = (firstTryCorrect / total) * 100;
      return json(route, { session: { ...session(kind, 'x'), endedAt: new Date().toISOString() }, summary: { total, answered: first.size, firstTryCorrect, accuracy, passed: kind === 'review' ? null : accuracy >= 80 } });
    }
    return json(route, { message: `no fake for ${method} ${path}` }, 404);
  });
  return api;
}
