/**
 * Edit what you played: pick notes on the piano roll and delete them, drag them
 * to fix their timing or pitch, undo and redo, and let the app suggest what to
 * clean up (stray notes, double hits, loose timing). Nothing is applied until
 * you accept it, and the take as played is always kept.
 */

import type { Analysis } from '@music/analysis';
import type { Take } from '@music/contracts';
import type { Key } from '@music/theory';
import { Badge, Button, Card, SegmentedControl } from '@music/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { playEvents } from '../audio/sound.js';
import {
  applyChanges,
  cleanContext,
  noteName,
  snapSummary,
  snapToBeat,
  suggestCleanup,
  toEditNotes,
  withNotes,
  type EditNote,
  type Sensitivity,
  type Suggestion,
} from './clean.js';
import s from './record.module.css';

const ROW = 8;
const WIDTH = 1000;
const HISTORY = 100;
const BLACK = new Set([1, 3, 6, 8, 10]);

type Drag = { mode: 'move' | 'resize'; x: number; y: number; ids: number[]; base: EditNote[]; moved: boolean; lastPitch: number | null };

const sameNotes = (a: Take, b: Take) =>
  a.notes.length === b.notes.length && a.notes.every((n, i) => {
    const m = b.notes[i]!;
    return n.midi === m.midi && n.startMs === m.startMs && n.durationMs === m.durationMs && n.velocity === m.velocity;
  });

const hear = (n: Pick<EditNote, 'midi' | 'velocity'>) => playEvents([{ midi: n.midi, at: 0, dur: 0.4, velocity: n.velocity / 127 }]);

export interface NoteEditorProps {
  take: Take;
  /** The take as played, once it has been edited. */
  original: Take | null;
  analysis: Analysis;
  /** The key the numbers count from. */
  musicKey: Key;
  /** Playhead, in seconds. */
  time: number;
  onSeek: (seconds: number) => void;
  onTake: (take: Take) => void;
}

export function NoteEditor({ take, original, analysis, musicKey, time, onSeek, onTake }: NoteEditorProps) {
  const [notes, setNotes] = useState<EditNote[]>(() => toEditNotes(take));
  const [preview, setPreview] = useState<EditNote[] | null>(null);
  const [past, setPast] = useState<EditNote[][]>([]);
  const [future, setFuture] = useState<EditNote[][]>([]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [hovered, setHovered] = useState<readonly number[]>([]);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [zoom, setZoom] = useState('1');
  const [division, setDivision] = useState<'1' | '2' | '4'>('2');
  const [strength, setStrength] = useState(70);
  const [showOriginal, setShowOriginal] = useState(false);
  const nextId = useRef(take.notes.length + 1);
  const emitted = useRef<Take>(take);
  const drag = useRef<Drag | null>(null);
  const latest = useRef<EditNote[] | null>(null);
  const roll = useRef<SVGSVGElement>(null);

  // A different take from outside (another recording opened): start over.
  useEffect(() => {
    if (take === emitted.current) return;
    emitted.current = take;
    nextId.current = take.notes.length + 1;
    setNotes(toEditNotes(take));
    setPast([]);
    setFuture([]);
    setSelected(new Set());
    setPreview(null);
  }, [take]);

  const shown = preview ?? notes;
  const show = useCallback(
    (to: EditNote[]) => {
      setNotes(to);
      const t = withNotes(take, to);
      emitted.current = t;
      onTake(t);
    },
    [take, onTake],
  );
  const commit = useCallback(
    (next: EditNote[]) => {
      setPast((p) => [...p.slice(-(HISTORY - 1)), notes]);
      setFuture([]);
      show(next);
    },
    [notes, show],
  );
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([notes, ...future]);
    show(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast([...past, notes]);
    setFuture(future.slice(1));
    show(next);
  };

  const remove = () => {
    if (selected.size === 0) return;
    commit(notes.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  };

  const nudge = (dMs: number, dPitch: number) => {
    if (selected.size === 0) return;
    const next = notes.map((n) => (selected.has(n.id) ? { ...n, startMs: Math.max(0, n.startMs + dMs), midi: Math.min(127, Math.max(0, n.midi + dPitch)) } : n));
    commit(next);
    const first = next.find((n) => selected.has(n.id));
    if (first && dPitch) hear(first);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      return redo();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      return remove();
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      return setSelected(new Set(notes.map((n) => n.id)));
    }
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowLeft') nudge(-step, 0);
    else if (e.key === 'ArrowRight') nudge(step, 0);
    else if (e.key === 'ArrowUp') nudge(0, e.shiftKey ? 12 : 1);
    else if (e.key === 'ArrowDown') nudge(0, e.shiftKey ? -12 : -1);
    else return;
    e.preventDefault();
  };

  // ---- Piano roll geometry ----
  const total = Math.max(take.durationMs, 1);
  const pitches = [...shown, ...(showOriginal && original ? toEditNotes(original) : [])].map((n) => n.midi);
  const low = Math.min(...pitches, 55) - 1;
  const high = Math.max(...pitches, 76) + 1;
  const rows = high - low + 1;
  const height = rows * ROW;
  const x = (ms: number) => (ms / total) * WIDTH;
  const y = (midi: number) => (high - midi) * ROW;

  const startDrag = (e: ReactPointerEvent<SVGRectElement>, note: EditNote) => {
    e.stopPropagation();
    e.preventDefault();
    roll.current?.parentElement?.focus();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const ids = selected.has(note.id) ? [...selected] : [note.id];
    if (!selected.has(note.id) || (additive && selected.size === 1)) setSelected(additive ? new Set([...selected, note.id]) : new Set([note.id]));
    const box = e.currentTarget.getBoundingClientRect();
    const resize = e.clientX > box.right - Math.min(10, box.width / 3);
    drag.current = { mode: resize ? 'resize' : 'move', x: e.clientX, y: e.clientY, ids, base: notes, moved: false, lastPitch: null };
    hear(note);
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      const r = roll.current?.getBoundingClientRect();
      if (!d || !r) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      d.moved = true;
      const dMs = Math.round(((dx / r.width) * total) / 5) * 5;
      const dRows = d.mode === 'move' ? -Math.round((dy / r.height) * rows) : 0;
      const next = d.base.map((n) => {
        if (!d.ids.includes(n.id)) return n;
        if (d.mode === 'resize') return { ...n, durationMs: Math.max(10, n.durationMs + dMs) };
        return { ...n, startMs: Math.max(0, n.startMs + dMs), midi: Math.min(127, Math.max(0, n.midi + dRows)) };
      });
      const lead = next.find((n) => n.id === note.id)!;
      if (d.mode === 'move' && d.lastPitch !== lead.midi) {
        if (d.lastPitch !== null) hear(lead);
        d.lastPitch = lead.midi;
      }
      latest.current = next;
      setPreview(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = drag.current;
      drag.current = null;
      const result = latest.current;
      latest.current = null;
      setPreview(null);
      if (d?.moved && result) commit(result);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---- Suggestions ----
  const ctx = useMemo(() => cleanContext(analysis, musicKey), [analysis, musicKey]);
  const suggestions = useMemo(() => suggestCleanup(notes, ctx, sensitivity).filter((x) => !skipped.has(x.key)), [notes, ctx, sensitivity, skipped]);
  const likely = suggestions.filter((x) => x.confidence === 'likely');
  const accept = (list: Suggestion[]) => {
    if (list.length === 0) return;
    commit(applyChanges(notes, list.flatMap((x) => x.changes)));
    setSelected(new Set());
    setHovered([]);
  };
  const skip = (x: Suggestion) => setSkipped(new Set([...skipped, x.key]));
  const marked = new Map<number, 'likely' | 'maybe'>();
  for (const x of suggestions) for (const id of x.noteIds) if (marked.get(id) !== 'likely') marked.set(id, x.confidence);

  // ---- Snap ----
  const snapped = useMemo(
    () => snapToBeat(notes, { beats: analysis.grid.beats, bpm: analysis.grid.bpm, division: Number(division) as 1 | 2 | 4, strength: strength / 100 }),
    [notes, analysis.grid, division, strength],
  );
  const snapInfo = useMemo(() => snapSummary(notes, snapped), [notes, snapped]);

  const edited = original !== null && !sameNotes(take, original);
  const revert = () => {
    if (!original) return;
    commit(toEditNotes(original, nextId.current));
    nextId.current += original.notes.length;
    setSelected(new Set());
  };

  const lead = selected.size === 1 ? shown.find((n) => selected.has(n.id)) : undefined;
  const ghost = showOriginal && original ? original.notes : null;

  return (
    <Card padding="md" className={s.editor} data-testid="note-editor">
      <div className={s.sectionHead}>
        <span className="ui-eyebrow">
          Edit the notes {edited && <Badge tone="accent">Edited</Badge>}
        </span>
        <span className="ui-muted">Click a note to pick it. Drag to move it, drag its right end to change its length.</span>
      </div>

      <div className={s.editorBar}>
        <Button size="sm" variant="secondary" onClick={undo} disabled={past.length === 0} data-testid="ed-undo">
          ↶ Undo
        </Button>
        <Button size="sm" variant="secondary" onClick={redo} disabled={future.length === 0} data-testid="ed-redo">
          ↷ Redo
        </Button>
        <Button size="sm" variant="danger" onClick={remove} disabled={selected.size === 0} data-testid="ed-delete">
          Delete {selected.size > 1 ? `${selected.size} notes` : 'note'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(notes.map((n) => n.id)))} disabled={notes.length === 0}>
          Pick all
        </Button>
        <span className={s.spacer} />
        <span className="ui-field-label">Zoom</span>
        <SegmentedControl
          label="Zoom"
          value={zoom}
          onChange={setZoom}
          options={[
            { value: '1', label: 'Fit' },
            { value: '2', label: '2×' },
            { value: '4', label: '4×' },
            { value: '8', label: '8×' },
          ]}
        />
      </div>

      <div className={s.editorRoll} tabIndex={0} onKeyDown={onKeyDown} role="application" aria-label="Piano roll editor. Arrow keys move the picked notes, Delete removes them." data-testid="ed-area">
        <svg
          ref={roll}
          className={s.editRoll}
          style={{ width: `${Number(zoom) * 100}%` }}
          viewBox={`0 0 ${WIDTH} ${height}`}
          preserveAspectRatio="none"
          data-testid="ed-roll"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setSelected(new Set());
            onSeek((((e.clientX - r.left) / r.width) * total) / 1000);
          }}
        >
          {Array.from({ length: rows }, (_, i) => {
            const midi = high - i;
            return <rect key={midi} x={0} y={i * ROW} width={WIDTH} height={ROW} className={s.editRow} data-black={BLACK.has(midi % 12) || undefined} data-c={midi % 12 === 0 || undefined} />;
          })}
          {ghost?.map((n, i) => (
            <rect key={`g${i}`} x={x(n.startMs)} y={y(n.midi) + 1} width={Math.max(2, x(n.durationMs))} height={ROW - 2} rx={1.5} className={s.ghost} />
          ))}
          {shown.map((n) => (
            <rect
              key={n.id}
              x={x(n.startMs)}
              y={y(n.midi) + 1}
              width={Math.max(3, x(n.durationMs))}
              height={ROW - 2}
              rx={1.5}
              className={s.editNote}
              style={{ opacity: 0.45 + (n.velocity / 127) * 0.55 }}
              data-left={n.midi < 60 || undefined}
              data-selected={selected.has(n.id) || undefined}
              data-mark={marked.get(n.id)}
              data-hot={hovered.includes(n.id) || undefined}
              data-testid="ed-note"
              data-id={n.id}
              data-midi={n.midi}
              data-start={n.startMs}
              onPointerDown={(e) => startDrag(e, n)}
            />
          ))}
          <line x1={x(time * 1000)} x2={x(time * 1000)} y1={0} y2={height} className={s.rollHead} />
        </svg>
      </div>
      <p className={`ui-muted ${s.legend}`} data-testid="ed-status">
        {lead
          ? `${noteName(lead.midi)}, from ${(lead.startMs / 1000).toFixed(2)}s, ${Math.round(lead.durationMs)} ms long, pressed at ${lead.velocity} of 127.`
          : selected.size > 1
            ? `${selected.size} notes picked. Arrow keys move them; Shift makes the steps bigger.`
            : `${notes.length} notes. Violet is below middle C, blue above it. Faint notes were pressed softly.`}
      </p>

      <div className={s.cleanGrid}>
        <div className={s.cleanPanel} data-testid="ed-suggestions">
          <div className={s.sectionHead}>
            <span className="ui-eyebrow">Clean up for me</span>
            <SegmentedControl
              label="How picky"
              value={sensitivity}
              onChange={setSensitivity}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'normal', label: 'Normal' },
                { value: 'strong', label: 'Strong' },
              ]}
            />
          </div>
          {suggestions.length === 0 ? (
            <p className="ui-muted" data-testid="ed-clean-none">
              {skipped.size > 0 ? 'Nothing else to suggest.' : 'No stray notes, double hits or overlaps found. Nice playing.'}
            </p>
          ) : (
            <>
              <div className={s.acceptRow}>
                <span className="ui-muted">
                  {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}. Each one is yours to accept or skip.
                </span>
                {likely.length > 0 && (
                  <Button size="sm" variant="primary" onClick={() => accept(likely)} data-testid="ed-accept-all">
                    Accept the {likely.length} sure {likely.length === 1 ? 'one' : 'ones'}
                  </Button>
                )}
              </div>
              <ul className={s.suggestions}>
                {suggestions.map((x) => (
                  <li
                    key={x.key}
                    className={s.suggestion}
                    onMouseEnter={() => setHovered(x.noteIds)}
                    onMouseLeave={() => setHovered([])}
                    onFocus={() => setHovered(x.noteIds)}
                    onBlur={() => setHovered([])}
                    data-testid="ed-suggestion"
                    data-kind={x.kind}
                  >
                    <div className={s.suggestionText}>
                      <div className={s.suggestionTitle}>
                        <strong>{x.title}</strong>
                        <Badge tone={x.confidence === 'likely' ? 'accent' : 'neutral'}>{x.confidence === 'likely' ? 'Sure' : 'Maybe'}</Badge>
                      </div>
                      <span className="ui-muted">{x.why}</span>
                    </div>
                    <div className={s.suggestionButtons}>
                      <Button size="sm" variant="secondary" onClick={() => accept([x])} data-testid="ed-accept">
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(x)} data-testid="ed-skip">
                        Skip
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {skipped.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSkipped(new Set())}>
              Show the {skipped.size} I skipped
            </Button>
          )}
        </div>

        <div className={s.cleanPanel} data-testid="ed-snap-panel">
          <div className={s.sectionHead}>
            <span className="ui-eyebrow">Tighten the timing</span>
            <span className="ui-muted">{analysis.steadyBeat ? `About ${Math.round(analysis.grid.bpm)} beats a minute` : ''}</span>
          </div>
          {analysis.steadyBeat ? (
            <>
              <SegmentedControl
                label="Grid"
                value={division}
                onChange={setDivision}
                options={[
                  { value: '1', label: 'Beats' },
                  { value: '2', label: 'Half beats' },
                  { value: '4', label: 'Quarter beats' },
                ]}
              />
              <label className="ui-field">
                <span className="ui-field-label">Strength: {strength}%</span>
                <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className={s.slider} data-testid="ed-strength" />
              </label>
              <p className="ui-muted" data-testid="ed-snap-info">
                {snapInfo.moved === 0 ? 'No notes would move.' : `${snapInfo.moved} notes would move by ${Math.round(snapInfo.averageMs)} ms on average.`} Low strength keeps your feel; 100% is
                robot-exact.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={snapInfo.moved === 0}
                onClick={() => {
                  commit(snapped);
                  setSelected(new Set());
                }}
                data-testid="ed-snap"
              >
                Move the notes
              </Button>
            </>
          ) : (
            <p className="ui-muted" data-testid="ed-snap-none">
              No steady beat was found in this take, so there is no grid to tighten it to. Free playing is fine as it is.
            </p>
          )}
        </div>
      </div>

      {original && (
        <div className={s.originalRow}>
          <span className="ui-muted">The take as you played it is kept ({original.notes.length} notes).</span>
          <Button size="sm" variant="ghost" onClick={() => setShowOriginal((v) => !v)} data-testid="ed-compare">
            {showOriginal ? 'Hide what I played' : 'Show what I played'}
          </Button>
          <Button size="sm" variant="secondary" onClick={revert} disabled={!edited} data-testid="ed-original">
            Go back to what I played
          </Button>
        </div>
      )}
    </Card>
  );
}
