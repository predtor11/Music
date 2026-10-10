import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUnits } from '../src/api/client.js';
import { getLesson, lessonForPractice } from '../src/api/curriculum.js';

const unit = { id: 'unit', order: 1, title: 'Unit', summary: '', outcome: '', lessonIds: [] };
const lesson = { id: 'shared-id', unitId: 'unit', order: 1, title: 'Lesson', summary: '', minutes: 1, steps: [{ type: 'explore', title: 'Explore', body: 'Play.' }] };
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe('instrument-specific curriculum', () => {
  it('does not expose another instrument when the service returns mixed units', async () => {
    const fetch = vi.fn().mockResolvedValue(json([unit, { ...unit, id: 'guitar-unit', instrument: 'guitar' }]));
    vi.stubGlobal('fetch', fetch);
    expect((await getUnits('guitar')).map((u) => u.id)).toEqual(['guitar-unit']);
    expect(fetch.mock.calls[0]![0]).toBe('/api/curriculum/units?instrument=guitar');
    fetch.mockResolvedValueOnce(json([unit, { ...unit, id: 'guitar-unit', instrument: 'guitar' }]));
    expect((await getUnits('piano')).map((u) => u.id)).toEqual(['unit']);
  });
  it('keeps lessons with the same id separate in the practice cache', async () => {
    const fetch = vi.fn(async (path: string) => json({ ...lesson, title: path.includes('instrument=guitar') ? 'Guitar' : 'Piano',
      ...(path.includes('instrument=guitar') ? { instrument: 'guitar' } : {}),
    }));
    vi.stubGlobal('fetch', fetch);
    await getLesson(lesson.id, 'piano'); await getLesson(lesson.id, 'guitar');
    expect((await lessonForPractice(lesson.id, 'piano')).title).toBe('Piano');
    expect((await lessonForPractice(lesson.id, 'guitar')).title).toBe('Guitar');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects a piano lesson opened through a guitar deep link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(lesson)));
    await expect(getLesson(lesson.id, 'guitar')).rejects.toThrow('another instrument');
  });
});
