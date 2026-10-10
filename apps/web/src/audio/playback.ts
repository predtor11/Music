// Reference audio must not become a microphone answer. Keep overlapping clips
// guarded independently, including a short speaker/room decay after playback.
let active = 0;
const listeners = new Set<() => void>();
export const isPlaying = () => active > 0;
export function subscribePlayback(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function beginPlayback(): () => void {
  active++;
  listeners.forEach((listener) => listener());
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    setTimeout(() => {
      active--;
      listeners.forEach((listener) => listener());
    }, 250);
  };
}
