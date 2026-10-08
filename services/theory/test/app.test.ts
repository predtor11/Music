import { describe, expect, it } from 'vitest';
import { SongAnalysisSchema } from '@music/contracts';
import { sampleNotes } from '@music/analysis';
import { buildApp } from '../src/app.js';

const app = buildApp({ logger: false });

describe('theory service', () => {
  it('names a chord with its numeral in the key', async () => {
    const res = await app.inject({ url: '/chord?notes=55,59,62,65&key=C' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ symbol: 'G7', roman: 'V7', nashville: '57', inversion: 'root position', notes: ['G', 'B', 'D', 'F'] });
  });

  it('lists other readings of the same notes', async () => {
    const res = await app.inject({ url: '/chord?notes=60,64,67,69' });
    expect(res.json()).toMatchObject({ symbol: 'C6', alternatives: ['Am7/C'] });
  });

  it('returns nulls when the notes are not a chord', async () => {
    expect((await app.inject({ url: '/chord?notes=60,61' })).json().symbol).toBeNull();
  });

  it('rejects bad input', async () => {
    expect((await app.inject({ url: '/chord?notes=abc' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/chord?notes=60,64,67&key=H' })).statusCode).toBe(400);
  });

  it('spells scales', async () => {
    expect((await app.inject({ url: '/scale/Eb' })).json()).toEqual({ key: 'Eb', type: 'major', notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] });
    expect((await app.inject({ url: '/scale/Am?type=harmonicMinor' })).json().notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
  });

  it('analyses a take: key, chords over time and a chart', async () => {
    const notes = sampleNotes().map((n) => ({ midi: n.midi, velocity: Math.round(n.velocity * 127), startMs: n.start * 1000, durationMs: (n.end - n.start) * 1000 }));
    const res = await app.inject({ method: 'POST', url: '/analyze', payload: { notes, bpm: 92 } });
    expect(res.statusCode).toBe(200);
    const body = SongAnalysisSchema.parse(res.json());
    expect(body.key.key).toBe('G');
    expect(body.segments.filter((s) => s.symbol).slice(0, 4).map((s) => s.roman)).toEqual(['I', 'V', 'vi', 'IV']);
    expect(body.segments.some((s) => s.symbol === 'D/F#')).toBe(true);
    expect(body.chart?.key).toBe('G');
  });

  it('counts from the key the player gives', async () => {
    const notes = [60, 64, 67].map((midi) => ({ midi, velocity: 90, startMs: 0, durationMs: 2000 }));
    const body = (await app.inject({ method: 'POST', url: '/analyze', payload: { notes, keyHint: 'G' } })).json();
    expect(body.segments.find((s: { symbol: string | null }) => s.symbol)?.roman).toBe('IV');
    expect((await app.inject({ method: 'POST', url: '/analyze', payload: { notes, keyHint: 'H' } })).statusCode).toBe(400);
  });
});
