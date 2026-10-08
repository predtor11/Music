import type { Progress } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { standing } from '../src/pages/unlocks.js';

const progress: Progress = {
  userId: '00000000-0000-4000-8000-000000000001',
  units: [
    {
      unitId: 'u1',
      unlocked: true,
      checkpointPassed: false,
      lessons: [
        { lessonId: 'a', status: 'done' },
        { lessonId: 'b', status: 'available' },
        { lessonId: 'c', status: 'locked' },
      ],
    },
    { unitId: 'u2', unlocked: false, checkpointPassed: false, lessons: [{ lessonId: 'd', status: 'locked' }] },
  ],
};

describe('standing', () => {
  it('reads lesson and unit status, and counts what is done', () => {
    const st = standing(progress);
    expect(['a', 'b', 'c', 'd'].map(st.lesson)).toEqual(['done', 'available', 'locked', 'locked']);
    expect(st.unit('u1')).toEqual({ unlocked: true, checkpointPassed: false, done: 1, total: 3, previousUnitId: null });
    expect(st.unit('u2')).toMatchObject({ unlocked: false, previousUnitId: 'u1' });
    expect(st.next).toBe('b');
  });

  it('prefers a started lesson as the next one', () => {
    const started = structuredClone(progress);
    started.units[0]!.lessons[2]!.status = 'in-progress';
    expect(standing(started).next).toBe('c');
  });

  it('locks lessons the progress service does not know yet', () => {
    expect(standing(progress).lesson('new')).toBe('locked');
  });

  it('opens everything when progress is unavailable', () => {
    const st = standing(null);
    expect(st.lesson('anything')).toBe('available');
    expect(st.unit('u9').unlocked).toBe(true);
    expect(st.next).toBeNull();
  });
});
