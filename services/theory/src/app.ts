import { analyzeNotes, ascii, buildChart } from '@music/analysis';
import { ChordQuerySchema, SongAnalysisRequestSchema, type ChordAnswer, type ScaleAnswer, type SongAnalysis } from '@music/contracts';
import { createService } from '@music/service-kit';
import {
  INVERSION_LABELS,
  SCALE_LABELS,
  identifyChords,
  nashvilleNumber,
  noteToString,
  parseKey,
  romanNumeral,
  spellScale,
  type ScaleType,
} from '@music/theory';
import { z } from 'zod';

const ScaleQuerySchema = z.object({ type: z.enum(Object.keys(SCALE_LABELS) as [ScaleType, ...ScaleType[]]).optional() });

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * The theory service: chord and scale lookups over HTTP, for services and
 * future tools. The web app uses @music/theory directly so grading needs no
 * network call. Stores nothing.
 */
export function buildApp(options: { logger?: boolean } = {}) {
  const app = createService({ name: 'theory', ...options });

  // GET /chord?notes=60,64,67&key=C
  app.get('/chord', async (req): Promise<ChordAnswer> => {
    const query = ChordQuerySchema.parse(req.query);
    const key = parseKey(query.key);
    if (!key) throw badRequest(`Unknown key: ${query.key}`);
    const [best, ...rest] = identifyChords(query.notes, key);
    if (!best) {
      return { symbol: null, name: null, inversion: null, roman: null, nashville: null, notes: [], alternatives: [] };
    }
    return {
      symbol: best.symbol,
      name: `${best.root} ${best.type.name}`,
      inversion: INVERSION_LABELS[best.inversion],
      roman: romanNumeral(best, key),
      nashville: nashvilleNumber(best, key),
      notes: best.notes,
      alternatives: rest.map((m) => m.symbol),
    };
  });

  // GET /scale/:key?type=major (type defaults to the key's own mode)
  app.get<{ Params: { key: string } }>('/scale/:key', async (req): Promise<ScaleAnswer> => {
    const key = parseKey(decodeURIComponent(req.params.key));
    if (!key) throw badRequest(`Unknown key: ${req.params.key}`);
    const { type } = ScaleQuerySchema.parse(req.query);
    const scaleType: ScaleType = type ?? (key.mode === 'major' ? 'major' : 'naturalMinor');
    return { key: noteToString(key.tonic), type: scaleType, notes: spellScale(key.tonic, scaleType).map(noteToString) };
  });

  // POST /analyze: the key and chords of notes someone played (or a MIDI file's notes).
  app.post('/analyze', async (req): Promise<SongAnalysis> => {
    const body = SongAnalysisRequestSchema.parse(req.body);
    const hint = body.keyHint ? parseKey(body.keyHint) : null;
    if (body.keyHint && !hint) throw badRequest(`Unknown key: ${body.keyHint}`);
    const notes = body.notes.map((n) => ({ midi: n.midi, start: n.startMs / 1000, end: (n.startMs + n.durationMs) / 1000, velocity: n.velocity / 127 }));
    const a = analyzeNotes(notes, { bpm: body.bpm, key: hint });
    const key = hint ?? a.key.key;
    const keyText = (k: typeof key) => ascii(noteToString(k.tonic)) + (k.mode === 'minor' ? 'm' : '');
    return {
      key: { key: keyText(a.key.key), confidence: a.key.confidence },
      otherKeys: a.keyAlternatives.map((g) => ({ key: keyText(g.key), confidence: g.confidence })),
      bpm: a.steadyBeat ? Math.round(a.grid.bpm * 10) / 10 : null,
      segments: a.segments.map((s) => ({
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        symbol: s.chord ? ascii(s.chord.symbol) : null,
        roman: s.chord ? ascii(s.chord.roman) : null,
        notes: s.chord ? s.chord.notes.map(ascii) : [],
      })),
      chart: a.steadyBeat ? buildChart(a.segments, a.grid, key, 'Analysis', { source: 'recording' }) : null,
    };
  });

  return app;
}
