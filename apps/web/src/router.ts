/**
 * Hash routes, so the app works from any static host without server rewrites.
 *   #/                 Chord Namer
 *   #/lessons          Units and lessons
 *   #/lesson/:id       Lesson player
 *   #/checkpoint/:id   Unit checkpoint test
 *   #/hands            Hand and finger sessions
 *   #/hands/:id        One hand session
 *   #/pieces           Pieces to learn
 *   #/pieces/:id       One piece: overview and practice
 *   #/review           Practice for weak spots
 *   #/progress         Progress report
 *   #/charts           Band charts
 *   #/charts/new       New chart
 *   #/charts/:id       One chart
 *   #/charts/:id/edit  Edit a chart
 *   #/charts/import/:c A chart from a share link
 *   #/settings         Settings
 *   #/signin           Sign in
 */

import { useEffect, useState } from 'react';

export type Route =
  | { page: 'chords' }
  | { page: 'lessons' }
  | { page: 'lesson'; id: string }
  | { page: 'checkpoint'; unitId: string }
  | { page: 'hands' }
  | { page: 'hand'; id: string }
  | { page: 'pieces' }
  | { page: 'piece'; id: string }
  | { page: 'review' }
  | { page: 'progress' }
  | { page: 'charts' }
  | { page: 'chart'; id: string }
  | { page: 'chartEdit'; id: string | null }
  | { page: 'chartImport'; data: string }
  | { page: 'settings' }
  | { page: 'signin' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'lessons') return { page: 'lessons' };
  if (parts[0] === 'lesson' && parts[1]) return { page: 'lesson', id: parts[1] };
  if (parts[0] === 'checkpoint' && parts[1]) return { page: 'checkpoint', unitId: parts[1] };
  if (parts[0] === 'hands' && parts[1]) return { page: 'hand', id: parts[1] };
  if (parts[0] === 'hands') return { page: 'hands' };
  if (parts[0] === 'pieces' && parts[1]) return { page: 'piece', id: parts[1] };
  if (parts[0] === 'pieces') return { page: 'pieces' };
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
  pieces: '#/pieces',
  piece: (id: string) => `#/pieces/${encodeURIComponent(id)}`,
  review: '#/review',
  progress: '#/progress',
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
