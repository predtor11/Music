/**
 * Hash routes, so the app works from any static host without server rewrites.
 *   #/                 Chord Namer
 *   #/lessons          Units and lessons
 *   #/lesson/:id       Lesson player
 *   #/checkpoint/:id   Unit checkpoint test
 */

import { useEffect, useState } from 'react';

export type Route =
  | { page: 'chords' }
  | { page: 'lessons' }
  | { page: 'lesson'; id: string }
  | { page: 'checkpoint'; unitId: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'lessons') return { page: 'lessons' };
  if (parts[0] === 'lesson' && parts[1]) return { page: 'lesson', id: parts[1] };
  if (parts[0] === 'checkpoint' && parts[1]) return { page: 'checkpoint', unitId: parts[1] };
  return { page: 'chords' };
}

export const href = {
  chords: '#/',
  lessons: '#/lessons',
  lesson: (id: string) => `#/lesson/${encodeURIComponent(id)}`,
  checkpoint: (unitId: string) => `#/checkpoint/${encodeURIComponent(unitId)}`,
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
