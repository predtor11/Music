import type { TestItem } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { skillFor, skillLabel, topicOf } from '../src/index.js';

const items: Array<[TestItem, string]> = [
  [{ kind: 'find-note', id: 'a', prompt: '', pc: 2 }, 'note:D'],
  [{ kind: 'find-note', id: 'b', prompt: '', midi: 61 }, 'note:C#'],
  [{ kind: 'play-interval', id: 'c', prompt: '', startMidi: 60, semitones: 4 }, 'interval:M3'],
  [{ kind: 'play-interval', id: 'd', prompt: '', semitones: -3 }, 'interval:m3'],
  [{ kind: 'play-scale', id: 'e', prompt: '', sequence: [7, 9, 11, 0, 2, 4, 6, 7], direction: 'up' }, 'scale:G'],
  [{ kind: 'build-chord', id: 'f', prompt: '', pitchClasses: [0, 4, 7], bassPc: null }, 'chord:C-E-G'],
  [{ kind: 'name-it', id: 'g', prompt: '', shownMidi: [62], choices: ['C', 'D'], answer: 'D' }, 'name-it:D'],
];

describe('skillFor', () => {
  it.each(items)('tags %o as %s', (item, skill) => {
    expect(skillFor(item)).toBe(skill);
  });
});

describe('skillLabel', () => {
  it('reads as plain words', () => {
    expect(skillLabel('note:C#')).toBe('Finding C♯');
    expect(skillLabel('interval:M3')).toBe('Interval: major 3rd');
    expect(skillLabel('interval:P8')).toBe('Interval: octave');
    expect(skillLabel('chord:C-E-G')).toBe('Chord C E G');
    expect(skillLabel('scale:G')).toBe('Scale from G');
    expect(skillLabel('name-it:D')).toBe('Naming D');
    expect(skillLabel('rhythm:4/4')).toBe('Rhythm in 4/4');
    expect(skillLabel('odd')).toBe('odd');
  });
  it('splits topics', () => {
    expect(topicOf('interval:M3')).toBe('interval');
    expect(topicOf('plain')).toBe('plain');
  });
});
