import { ChordQuerySchema, type ChordAnswer, type ScaleAnswer } from '@music/contracts';
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

  return app;
}
