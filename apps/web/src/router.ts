/**
 * Hash routes, so the app works from any static host without server rewrites.
 *   #/                 Chord Namer
 *   #/lessons          Units and lessons
 *   #/lesson/:id       Lesson player
 *   #/checkpoint/:id   Unit checkpoint test
 *   #/hands            Hand and finger sessions
 *   #/hands/:id        One hand session
 *   #/review           Practice for weak spots
 *   #/progress         Progress report
 *   #/jam              Jam-along (?n=1,5,6,4&key=G&style=pop&bpc=4&bpm=96 to preset it)
 *   #/bandtalk/:id     Band-talk cheat sheet, optionally open at one phrase
 *   #/charts           Band charts
 *   #/charts/new       New chart
 *   #/charts/:id       One chart
 *   #/charts/:id/edit  Edit a chart
 *   #/charts/import/:c A chart from a share link
 *   #/settings         Settings
 *   #/signin           Sign in
 */

import type { JamStyle } from '@music/contracts';
import { useEffect, useState } from 'react';

/** A progression to open the jam-along with, from a link such as a band-talk example. */
export interface JamSetup {
  numerals?: string[];
  key?: string;
  style?: JamStyle;
  beatsPerChord?: number;
  bpm?: number;
}

export type Route =
  | { page: 'chords' }
  | { page: 'lessons' }
  | { page: 'lesson'; id: string }
  | { page: 'checkpoint'; unitId: string }
  | { page: 'hands' }
  | { page: 'hand'; id: string }
  | { page: 'review' }
  | { page: 'progress' }
  | { page: 'jam'; setup: JamSetup }
  | { page: 'bandtalk'; id: string | null }
  | { page: 'charts' }
  | { page: 'chart'; id: string }
  | { page: 'chartEdit'; id: string | null }
  | { page: 'chartImport'; data: string }
  | { page: 'settings' }
  | { page: 'signin' };

const STYLES: readonly JamStyle[] = ['pop', 'rock', 'ballad', 'four-on-the-floor', 'half-time', 'shuffle'];

function jamSetup(query: string): JamSetup {
  const q = new URLSearchParams(query);
  const num = (name: string) => {
    const v = Number(q.get(name));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const style = q.get('style') as JamStyle | null;
  return {
    numerals: q.get('n')?.split(',').filter(Boolean),
    key: q.get('key') ?? undefined,
    style: style && STYLES.includes(style) ? style : undefined,
    beatsPerChord: num('bpc'),
    bpm: num('bpm'),
  };
}

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'jam') return { page: 'jam', setup: jamSetup(query) };
  if (parts[0] === 'bandtalk') return { page: 'bandtalk', id: parts[1] ?? null };
  if (parts[0] === 'lessons') return { page: 'lessons' };
  if (parts[0] === 'lesson' && parts[1]) return { page: 'lesson', id: parts[1] };
  if (parts[0] === 'checkpoint' && parts[1]) return { page: 'checkpoint', unitId: parts[1] };
  if (parts[0] === 'hands' && parts[1]) return { page: 'hand', id: parts[1] };
  if (parts[0] === 'hands') return { page: 'hands' };
  if (parts[0] === 'review') return { page: 'review' };
  if (parts[0] === 'progress') return { page: 'progress' };
  if (parts[0] === 'charts') {
    if (parts[1] === 'new') return { page: 'chartEdit', id: null };
    if (parts[1] === 'import' && parts[2]) return { page: 'chartImport', data: parts[2] };
    if (parts[1] && parts[2] === 'edit') return { page: 'chartEdit', id: parts[1] };
    if (parts[1]) return { page: 'chart', id: parts[1] };
    return { page: 'charts' };
  }
  if (parts[0] === 'settings') return { page: 'settings' };
  if (parts[0] === 'signin') return { page: 'signin' };
  return { page: 'chords' };
}

export const href = {
  chords: '#/',
  lessons: '#/lessons',
  lesson: (id: string) => `#/lesson/${encodeURIComponent(id)}`,
  checkpoint: (unitId: string) => `#/checkpoint/${encodeURIComponent(unitId)}`,
  hands: '#/hands',
  hand: (id: string) => `#/hands/${encodeURIComponent(id)}`,
  review: '#/review',
  progress: '#/progress',
  jam: (setup?: JamSetup) => {
    if (!setup) return '#/jam';
    const q = new URLSearchParams();
    if (setup.numerals) q.set('n', setup.numerals.join(','));
    if (setup.key) q.set('key', setup.key);
    if (setup.style) q.set('style', setup.style);
    if (setup.beatsPerChord) q.set('bpc', String(setup.beatsPerChord));
    if (setup.bpm) q.set('bpm', String(setup.bpm));
    return `#/jam?${q.toString()}`;
  },
  bandtalk: (id?: string) => (id ? `#/bandtalk/${encodeURIComponent(id)}` : '#/bandtalk'),
  charts: '#/charts',
  chartNew: '#/charts/new',
  chart: (id: string) => `#/charts/${encodeURIComponent(id)}`,
  chartEdit: (id: string) => `#/charts/${encodeURIComponent(id)}/edit`,
  settings: '#/settings',
  signin: '#/signin',
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
