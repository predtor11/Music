/**
 * One take, explained: the key, a plain-English summary, the chords over time
 * (names, numbers and sargam) on a timeline you can play from, and a piano
 * roll of the notes. Click a chord to fix it if the app heard it wrong.
 */

import { applyPedal, buildChart, type Analysis, type ChordSegment } from '@music/analysis';
import type { ChordCorrection, NoteNaming, Take } from '@music/contracts';
import { CHORD_TYPES, COMMON_KEYS, keyLabel, keyName, parseKey, pretty, spellInKey, type ChordQuality } from '@music/theory';
import { Badge, Button, Card, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { playChord } from '../audio/sound.js';
import { NoteEditor } from './NoteEditor.js';
import { importChart } from '../charts/store.js';
import { href } from '../router.js';
import { TakePlayer } from './playback.js';
import { analyseTake, analysisNotes, analysisPedal, correct, formatTime, midiFileName, takeToMidi, uncorrect } from './take.js';
import s from './record.module.css';

const KEY_GROUPS = [
  { label: 'Heard by the app', options: [{ value: '', label: 'What the app heard' }] },
  ...(['major', 'minor'] as const).map((mode) => ({
    label: mode === 'major' ? 'Major keys' : 'Minor keys',
    options: COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) })),
  })),
];

const QUALITY_OPTIONS = CHORD_TYPES.map((t) => ({ value: t.quality, label: t.name }));

export interface TakeViewProps {
  take: Take;
  title: string;
  keyOverride: string | null;
  corrections: readonly ChordCorrection[];
  naming: NoteNaming;
  onKey: (key: string | null) => void;
  onCorrections: (corrections: ChordCorrection[]) => void;
  /** The take as played, once it has been edited. */
  original?: Take | null;
  /** Called with the new notes after each edit. Without it the notes can't be edited. */
  onTake?: (take: Take) => void;
  /** Extra buttons next to Play and Export (Save, Delete). */
  actions?: ReactNode;
}

/** "Em7", or in sargam "Ga minor 7th" (Sa on the key's tonic). */
function chordName(seg: ChordSegment, naming: NoteNaming): string {
  if (!seg.chord) return 'No chord';
  const shape = seg.chord.quality === 'major' ? '' : ` ${seg.chord.name.split(' ').slice(1).join(' ')}`;
  if (naming === 'sargam') return seg.chord.sargam + shape;
  if (naming === 'both') return `${seg.chord.symbol} (${seg.chord.sargam}${shape})`;
  return seg.chord.symbol;
}

export function TakeView({ take, title, keyOverride, corrections, naming, onKey, onCorrections, original = null, onTake, actions }: TakeViewProps) {
  const analysis: Analysis = useMemo(() => analyseTake(take, title, keyOverride, corrections), [take, title, keyOverride, corrections]);
  // analysis.key is what the app heard; the numbers count from the learner's key when they picked one.
  const key = (keyOverride && parseKey(keyOverride)) || analysis.key.key;
  const duration = take.durationMs / 1000;
  const sounding = useMemo(() => applyPedal(analysisNotes(take), analysisPedal(take), duration), [take, duration]);
  const player = useRef(new TakePlayer());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);
  // A new analysis may have different segments.
  useEffect(() => setSelected((i) => (i !== null && i < analysis.segments.length ? i : null)), [analysis]);

  const play = (from = time >= duration - 0.05 ? 0 : time) => {
    setPlaying(true);
    player.current.play(sounding, duration, from, setTime, () => setPlaying(false));
  };
  const stop = () => {
    player.current.stop();
    setPlaying(false);
  };
  const seek = (sec: number) => {
    setTime(sec);
    if (playing) play(sec);
  };

  const exportMidi = () => {
    const bytes = takeToMidi(take, title);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = midiFileName(title);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const makeChart = () => {
    const chart = buildChart(analysis.segments, analysis.grid, key, title || 'Recording', { source: 'recording' });
    if (!chart) return setChartError('There are no chords to put on a chart yet.');
    location.hash = href.chart(importChart(chart));
  };

  const chords = analysis.segments.filter((x) => x.chord);
  const sel = selected === null ? null : analysis.segments[selected] ?? null;
  const pitches = take.notes.map((n) => n.midi);
  const low = Math.min(...pitches, 60) - 1;
  const high = Math.max(...pitches, 72) + 1;
  const sure = analysis.key.confidence >= 0.7 ? 'clear' : analysis.key.confidence >= 0.45 ? 'likely' : 'a guess';

  return (
    <motion.div className={s.take} variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <Card padding="lg" className={s.overview}>
          <div className={s.keyRow}>
            <div>
              <span className="ui-eyebrow">Key</span>
              <div className={s.keyName} data-testid="take-key">
                {pretty(keyLabel(key))}
              </div>
              <span className="ui-muted">{keyOverride ? 'You picked this key.' : `The app heard this (${sure}).`}</span>
            </div>
            <Select label="Change key" data-testid="take-key-select" value={keyOverride ?? ''} groups={KEY_GROUPS} onChange={(e) => onKey(e.target.value || null)} />
          </div>
          <ul className={s.summary} data-testid="take-summary">
            {analysis.summary.sentences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className={s.transport}>
            {playing ? (
              <Button variant="primary" onClick={stop} data-testid="take-stop">
                ■ Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={() => play()} disabled={take.notes.length === 0} data-testid="take-play">
                ▶ Play
              </Button>
            )}
            <span className={`ui-muted ${s.clock}`} data-testid="take-time">
              {formatTime(time * 1000)} / {formatTime(take.durationMs)}
            </span>
            <span className={s.spacer} />
            <Button variant="secondary" onClick={exportMidi} disabled={take.notes.length === 0} data-testid="take-export">
              Export .mid
            </Button>
            <Button variant="secondary" onClick={makeChart} disabled={chords.length === 0} data-testid="take-chart">
              Make a band chart
            </Button>
            {actions}
          </div>
          {chartError && <p className="ui-muted">{chartError}</p>}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="md">
          <div className={s.sectionHead}>
            <span className="ui-eyebrow">Chords as you played them</span>
            <span className="ui-muted">Click a chord to hear it or fix it.</span>
          </div>
          <div className={s.lane} data-testid="take-chords" role="list">
            {analysis.segments.map((seg, i) => (
              <button
                key={`${seg.start}-${i}`}
                type="button"
                role="listitem"
                className={s.chord}
                style={{ left: `${(seg.start / duration) * 100}%`, width: `${((seg.end - seg.start) / duration) * 100}%` }}
                data-empty={!seg.chord || undefined}
                data-edited={seg.edited || undefined}
                data-selected={selected === i || undefined}
                data-out={(seg.chord && !seg.chord.inKey) || undefined}
                aria-pressed={selected === i}
                title={seg.chord ? `${seg.chord.name} (${seg.chord.number}) at ${formatTime(seg.start * 1000)}` : 'No chord here'}
                onClick={() => {
                  setSelected(i);
                  seek(seg.start);
                }}
                data-testid="take-chord"
              >
                <span className={s.symbol}>{seg.chord ? (naming === 'sargam' ? seg.chord.sargam : seg.chord.symbol) : '·'}</span>
                {seg.chord && <span className={s.number}>{seg.chord.number}</span>}
                {seg.chord && naming === 'both' && <span className={s.number}>{seg.chord.sargam}</span>}
              </button>
            ))}
            <div className={s.playhead} style={{ left: `${(time / duration) * 100}%` }} aria-hidden />
          </div>
          <svg
            className={s.roll}
            viewBox={`0 0 1000 ${(high - low) * 6}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Piano roll of ${take.notes.length} notes`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * duration);
            }}
          >
            {take.notes.map((n, i) => (
              <rect
                key={i}
                x={(n.startMs / take.durationMs) * 1000}
                y={(high - n.midi) * 6}
                width={Math.max(2, (n.durationMs / take.durationMs) * 1000)}
                height={5}
                rx={1.5}
                className={s.note}
                data-left={n.midi < 60 || undefined}
              />
            ))}
            <line x1={(time / duration) * 1000} x2={(time / duration) * 1000} y1={0} y2={(high - low) * 6} className={s.rollHead} />
          </svg>
          <p className={`ui-muted ${s.legend}`}>
            Violet notes are below middle C (usually your left hand); blue notes are above it.
          </p>
        </Card>
      </motion.div>

      {onTake && (
        <motion.div variants={fadeUp}>
          <NoteEditor take={take} original={original} analysis={analysis} musicKey={key} time={time} onSeek={seek} onTake={onTake} />
        </motion.div>
      )}

      {sel && selected !== null && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card padding="md" className={s.fix} data-testid="take-fix">
            <div>
              <span className="ui-eyebrow">
                At {formatTime(sel.start * 1000)}, for {(sel.end - sel.start).toFixed(1)} seconds
              </span>
              <div className={s.fixName}>
                {chordName(sel, naming)} {sel.chord && <Badge tone={sel.chord.inKey ? 'neutral' : 'warn'}>{sel.chord.inKey ? `${sel.chord.number} in the key` : `${sel.chord.number}, outside the key`}</Badge>}
                {sel.edited && <Badge tone="accent">Set by you</Badge>}
              </div>
              {sel.chord && <span className="ui-muted">{sel.chord.name}: {sel.chord.notes.join(' ')}</span>}
            </div>
            <div className={s.fixControls}>
              <Select
                label="Root"
                data-testid="fix-root"
                value={sel.chord ? String(sel.chord.rootPc) : ''}
                options={[{ value: '', label: 'No chord' }, ...Array.from({ length: 12 }, (_, pc) => ({ value: String(pc), label: pretty(spellName(pc, key)) }))]}
                onChange={(e) => {
                  const v = e.target.value;
                  onCorrections(correct(corrections, analysis, selected, v === '' ? { rootPc: null, quality: null } : { rootPc: Number(v), quality: sel.chord?.quality ?? 'major' }));
                }}
              />
              <Select
                label="Type"
                data-testid="fix-quality"
                value={sel.chord?.quality ?? 'major'}
                disabled={!sel.chord}
                options={QUALITY_OPTIONS}
                onChange={(e) => sel.chord && onCorrections(correct(corrections, analysis, selected, { rootPc: sel.chord.rootPc, quality: e.target.value as ChordQuality }))}
              />
              {sel.alternatives.length > 0 && (
                <div className={s.alts}>
                  <span className="ui-field-label">Or maybe</span>
                  <div className={s.altRow}>
                    {sel.alternatives.slice(0, 3).map((alt) => (
                      <Button key={alt.symbol} size="sm" variant="ghost" onClick={() => onCorrections(correct(corrections, analysis, selected, { rootPc: alt.rootPc, quality: alt.quality }))}>
                        {alt.symbol}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" variant="secondary" disabled={!sel.chord} onClick={() => sel.chord && void playChord(chordMidi(sel))} data-testid="fix-hear">
                ▶ Hear it
              </Button>
              {sel.edited && (
                <Button size="sm" variant="ghost" onClick={() => onCorrections(uncorrect(corrections, analysis, selected))} data-testid="fix-reset">
                  Use the app's guess
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

function spellName(pc: number, key: Parameters<typeof spellInKey>[1]): string {
  const n = spellInKey(pc, key);
  return n.letter + (n.accidental > 0 ? '#'.repeat(n.accidental) : 'b'.repeat(-n.accidental));
}

/** The chord in a comfortable spot to hear: bass below middle C, the rest above. */
function chordMidi(seg: ChordSegment): number[] {
  const c = seg.chord!;
  const type = CHORD_TYPES.find((t) => t.quality === c.quality)!;
  return [48 + c.bassPc, ...type.intervals.map((i) => 60 + ((c.rootPc + i) % 12))];
}
