import { describe, expect, it } from 'vitest';
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
});
