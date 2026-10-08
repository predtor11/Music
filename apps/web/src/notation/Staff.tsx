/**
 * A staff drawn with VexFlow: treble or bass clef, a key signature, and one or
 * more notes or chords. Each chord can carry a tone, so a wrong answer can be
 * drawn in red next to the note that was asked for.
 */

import { C_MAJOR, keySignature, type Key, type MidiNote } from '@music/theory';
import { useEffect, useRef, useState } from 'react';
import { vexKey, vexKeySignature, type Clef } from './spell.js';
import { loadVexFlow } from './vexflow.js';
import s from './staff.module.css';

export type StaffTone = 'normal' | 'good' | 'bad' | 'muted' | 'accent';

export interface StaffChord {
  midi: readonly MidiNote[];
  tone?: StaffTone;
  /** Short text under the chord ("Asked", "You played"). */
  caption?: string;
}

export interface StaffProps {
  clef: Clef;
  /** Key signature to draw; C major (none) by default. */
  keyOf?: Key;
  chords: readonly StaffChord[];
  /** Drawing width in staff units; by default it fits the clef, key signature and chords. */
  width?: number;
  'data-testid'?: string;
}

const HEIGHT = 150;
/** On-screen pixels per staff unit; the drawing still shrinks to fit narrow screens. */
const SCALE = 1.6;

export function Staff({ clef, keyOf = C_MAJOR, chords, width: fixedWidth, 'data-testid': testId = 'staff' }: StaffProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const keySig = vexKeySignature(keyOf);
  const width = fixedWidth ?? 120 + Math.abs(keySignature(keyOf)) * 12 + Math.max(1, chords.length) * 90;
  const drawKey = JSON.stringify([clef, keySig, chords.map((c) => [c.midi, c.tone])]);

  useEffect(() => {
    let live = true;
    void loadVexFlow().then((VF) => {
      const el = host.current;
      if (!live || !el) return;
      el.innerHTML = '';
      const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
      renderer.resize(width, HEIGHT);
      const ctx = renderer.getContext();
      const stave = new VF.Stave(0, 20, width - 2);
      stave.addClef(clef);
      let sig = keySig;
      try {
        stave.addKeySignature(sig);
      } catch {
        sig = 'C';
      }
      stave.setContext(ctx).draw();

      const notes = chords.map((c) => {
        const keys = [...c.midi].sort((a, b) => a - b).map((m) => vexKey(m, keyOf));
        return new VF.StaveNote({ clef, keys, duration: 'w' });
      });
      if (notes.length) {
        const voice = new VF.Voice({ numBeats: 4 * notes.length, beatValue: 4 }).setStrict(false).addTickables(notes);
        VF.Accidental.applyAccidentals([voice], sig);
        new VF.Formatter().joinVoices([voice]).format([voice], width - stave.getNoteStartX() - 20);
        voice.draw(ctx, stave);
        notes.forEach((n, i) => {
          const g = n.getSVGElement();
          const tone = chords[i]!.tone ?? 'normal';
          g?.classList.add(`tone-${tone}`);
          g?.setAttribute('data-tone', tone);
          g?.setAttribute('data-keys', n.getKeys().join(' '));
        });
      }
      const svg = el.querySelector('svg');
      if (svg) {
        svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
        svg.style.width = `${width * SCALE}px`;
        svg.style.height = 'auto';
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `${clef} clef staff`);
      }
      setReady(true);
    });
    return () => {
      live = false;
    };
    // drawKey covers clef, key and chords.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, width]);

  const captions = chords.filter((c) => c.caption);
  return (
    <div className={s.staff} data-testid={testId} data-ready={ready} data-clef={clef} data-key={keySig}>
      {!ready && <span className={s.loading}>Drawing the staff…</span>}
      <div className={s.canvas}>
        <div ref={host} />
      </div>
      {captions.length > 0 && (
        <div className={s.captions}>
          {captions.map((c, i) => (
            <span key={i} data-tone={c.tone}>
              {c.caption}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
