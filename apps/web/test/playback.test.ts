import { describe, expect, it, vi } from 'vitest';
import { beginPlayback, isPlaying, subscribePlayback } from '../src/audio/playback.js';

describe('microphone reference playback guard', () => {
  it('keeps overlapping clips guarded through their speaker decay and releases once', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const unsubscribe = subscribePlayback(changed);
    try {
      const first = beginPlayback();
      const second = beginPlayback();
      expect(isPlaying()).toBe(true);
      first();
      first();
      vi.advanceTimersByTime(250);
      expect(isPlaying()).toBe(true);
      second();
      vi.advanceTimersByTime(249);
      expect(isPlaying()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isPlaying()).toBe(false);
      expect(changed).toHaveBeenCalledTimes(4);
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
