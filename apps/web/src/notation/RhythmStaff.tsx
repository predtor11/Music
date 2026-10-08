/**
 * A rhythm on a one-line staff: time signature, notes, rests, beams and ties,
 * a bar per measure. Notes can be lit as they come up and coloured once
 * graded.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { rhythmTokens, type RhythmPattern } from './rhythm.js';
import type { StaffTone } from './Staff.js';
import { loadVexFlow } from './vexflow.js';
import s from './staff.module.css';

export interface RhythmStaffProps {
  pattern: RhythmPattern;
  /** Tone per onset index, after grading. */
  tones?: ReadonlyMap<number, StaffTone>;
  /** The onset sounding now, lit while the pattern plays. */
  active?: number | null;
}

const HEIGHT = 110;
const BAR_WIDTH = 260;

export function RhythmStaff({ pattern, tones, active = null }: RhythmStaffProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const tokens = useMemo(() => rhythmTokens(pattern), [pattern]);
  const bars = tokens ? Math.max(...tokens.map((t) => t.bar)) + 1 : 0;
  const toneKey = JSON.stringify([...(tones ?? new Map())]);

  useEffect(() => {
    if (!tokens) return;
    let live = true;
    void loadVexFlow().then((VF) => {
      const el = host.current;
      if (!live || !el) return;
      el.innerHTML = '';
      const width = bars * BAR_WIDTH + 70;
      const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
      renderer.resize(width, HEIGHT);
      const ctx = renderer.getContext();
      const all: Array<{ note: InstanceType<typeof VF.StaveNote>; onset: number | null }> = [];
      let x = 0;
      for (let b = 0; b < bars; b++) {
        const w = b === 0 ? BAR_WIDTH + 70 : BAR_WIDTH;
        const stave = new VF.Stave(x, 10, w);
        // One line in the middle: rhythm only, no pitch.
        stave.setConfigForLines([0, 1, 2, 3, 4].map((i) => ({ visible: i === 2 })));
        if (b === 0) stave.addTimeSignature(`${pattern.timeSignature[0]}/${pattern.timeSignature[1]}`);
        stave.setContext(ctx).draw();
        x += w;

        const inBar = tokens.filter((t) => t.bar === b);
        const notes = inBar.map((t) => {
          const n = new VF.StaveNote({ keys: ['b/4'], duration: t.duration + (t.rest ? 'r' : ''), dots: t.dots, autoStem: false, stemDirection: 1 });
          for (let d = 0; d < t.dots; d++) VF.Dot.buildAndAttach([n], { all: true });
          return n;
        });
        inBar.forEach((t, i) => all.push({ note: notes[i]!, onset: t.onset }));
        const voice = new VF.Voice({ numBeats: pattern.timeSignature[0], beatValue: pattern.timeSignature[1] }).setStrict(false).addTickables(notes);
        const beams = VF.Beam.generateBeams(notes.filter((n, i) => !inBar[i]!.rest));
        new VF.Formatter().joinVoices([voice]).format([voice], w - (stave.getNoteStartX() - stave.getX()) - 20);
        voice.draw(ctx, stave);
        beams.forEach((beam) => beam.setContext(ctx).draw());
      }
      // Ties join the pieces of a note split across a bar line or an odd length.
      tokens.forEach((t, i) => {
        if (!t.tie) return;
        new VF.StaveTie({ firstNote: all[i]!.note, lastNote: all[i + 1]!.note, firstIndexes: [0], lastIndexes: [0] }).setContext(ctx).draw();
      });
      // Mark each piece with the onset it belongs to, for lighting and colouring.
      let current: number | null = null;
      all.forEach(({ note, onset }, i) => {
        if (onset !== null) current = onset;
        else if (tokens[i]!.rest) current = null;
        const g = note.getSVGElement();
        if (!g) return;
        g.setAttribute('data-rest', String(tokens[i]!.rest));
        if (current !== null && !tokens[i]!.rest) {
          g.setAttribute('data-onset', String(current));
          const tone = tones?.get(current);
          if (tone) g.classList.add(`tone-${tone}`);
        }
      });
      const svg = el.querySelector('svg');
      if (svg) {
        svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
        svg.style.width = `${width * 1.4}px`;
        svg.style.height = 'auto';
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Rhythm');
      }
      setReady(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, bars, toneKey]);

  // Light the note being played without redrawing.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.querySelectorAll('[data-onset]').forEach((g) => g.classList.toggle('tone-accent', g.getAttribute('data-onset') === String(active)));
  }, [active, ready, toneKey]);

  if (!tokens) return null;
  return (
    <div className={s.staff} data-testid="rhythm-staff" data-ready={ready}>
      {!ready && <span className={s.loading}>Drawing the rhythm…</span>}
      <div className={s.canvas}>
        <div ref={host} />
      </div>
    </div>
  );
}
