/**
 * Songs: open a MIDI file (or an audio file, which is less exact) and see the
 * key, then the chords over time as names, numbers and sargam. Tap a chord to
 * hear it, see it on the keyboard and fix it if the app heard it wrong. Loop
 * any part to practise it, and read one plain line about each section.
 */

import { withChord, withKey, type Analysis, type ChordSegment } from '@music/analysis';
import type { UserSettings } from '@music/contracts';
import { CHORD_TYPES, COMMON_KEYS, keyLabel, keyName, parseKey, pretty, spellInKey, type ChordQuality, type MidiNote } from '@music/theory';
import { Badge, Button, Card, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../audio/sound.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { noteLabeller } from '../keyboard/labels.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { TakePlayer } from '../record/playback.js';
import { formatTime } from '../record/take.js';
import { loadSongFile, sampleSong, SongError, type Song } from '../songs/song.js';
import { segmentAt, songSections } from '../songs/sections.js';
import r from '../record/record.module.css';
import s from '../songs/songs.module.css';

const KEY_GROUPS = [
  { label: 'Heard by the app', options: [{ value: '', label: 'What the app heard' }] },
  ...(['major', 'minor'] as const).map((mode) => ({
    label: mode === 'major' ? 'Major keys' : 'Minor keys',
    options: COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) })),
  })),
];
const QUALITY_OPTIONS = CHORD_TYPES.map((t) => ({ value: t.quality, label: t.name }));

interface Edit {
  rootPc: number | null;
  quality: ChordQuality | null;
}
interface Loop {
  a: number;
  b: number;
}

/** "Em7", or in sargam "Ga minor 7th" (Sa on the key's tonic). */
function chordName(seg: ChordSegment, naming: UserSettings['noteNaming']): string {
  if (!seg.chord) return 'No chord';
  const shape = seg.chord.quality === 'major' ? '' : ` ${seg.chord.name.split(' ').slice(1).join(' ')}`;
  if (naming === 'sargam') return seg.chord.sargam + shape;
  if (naming === 'both') return `${seg.chord.symbol} (${seg.chord.sargam}${shape})`;
  return seg.chord.symbol;
}

/** The chord in a comfortable spot: bass low, the rest around middle C. */
function chordMidi(seg: ChordSegment): number[] {
  const c = seg.chord!;
  const type = CHORD_TYPES.find((t) => t.quality === c.quality)!;
  return [48 + c.bassPc, ...type.intervals.map((i) => 60 + ((c.rootPc + i) % 12))];
}

function spellName(pc: number, key: Parameters<typeof spellInKey>[1]): string {
  const n = spellInKey(pc, key);
  return n.letter + (n.accidental > 0 ? '#'.repeat(n.accidental) : 'b'.repeat(-n.accidental));
}

export function SongsPage({ settings }: { settings: UserSettings }) {
  const [song, setSong] = useState<Song | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const open = useCallback(async (get: () => Promise<Song> | Song) => {
    setError(null);
    setBusy(0);
    try {
      setSong(await get());
    } catch (e) {
      setError(e instanceof SongError ? e.message : 'Something went wrong while opening that song. Try another file.');
    } finally {
      setBusy(null);
    }
  }, []);
  const openFile = (f: File) => void open(() => loadSongFile(f, (p) => setBusy(p)));

  useEffect(() => {
    const url = song?.audioUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [song]);

  if (song) return <SongView key={song.analysis.title + song.analysis.duration} song={song} settings={settings} onClose={() => setSong(null)} />;

  return (
    <motion.div className={r.page} variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div className={r.pageHead} variants={fadeUp}>
        <h1 className="ui-display">Songs</h1>
        <p className="ui-muted">
          Open a song and see its key and its chords in order, as names and as numbers (1, 5, 6, 4), the way a band talks. Then loop any part and play along with the chord highlighted on your instrument.
        </p>
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card
          padding="lg"
          className={s.drop}
          data-dragging={dragging || undefined}
          onDragOver={(e: React.DragEvent) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) openFile(f);
          }}
          data-testid="songs-drop"
        >
          {busy !== null ? (
            <div role="status" data-testid="songs-busy">
              <strong>Listening to the song…</strong>
              <p className="ui-muted">{busy > 0 ? `${Math.round(busy * 100)}% done.` : 'This can take a few seconds.'}</p>
            </div>
          ) : (
            <>
              <h2 className="ui-heading">Drop a song here</h2>
              <p className="ui-muted">
                A <strong>MIDI file</strong> (.mid) gives exact chords. An <strong>audio file</strong> (.mp3, .wav, .m4a) works too, but the app can only guess its chords, so check them by ear.
              </p>
              <div className={s.dropActions}>
                <Button variant="primary" onClick={() => file.current?.click()} data-testid="songs-choose">
                  Choose a file
                </Button>
                <Button variant="secondary" onClick={() => void open(sampleSong)} data-testid="songs-sample">
                  Try a sample song
                </Button>
              </div>
              <input
                ref={file}
                type="file"
                accept=".mid,.midi,audio/midi,audio/x-midi,audio/*"
                className={r.hiddenInput}
                data-testid="songs-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) openFile(f);
                }}
              />
            </>
          )}
          {error && (
            <p className={r.error} role="alert" data-testid="songs-error">
              {error}
            </p>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}

function SongView({ song, settings, onClose }: { song: Song; settings: UserSettings; onClose: () => void }) {
  const base = song.analysis;
  const [keyOverride, setKeyOverride] = useState<string | null>(null);
  const [edits, setEdits] = useState<ReadonlyMap<number, Edit>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<Loop | null>(null);
  const duration = base.duration;

  const analysis: Analysis = useMemo(() => {
    const named = (keyOverride && parseKey(keyOverride)) || base.key.key;
    let a = keyOverride ? withKey(base, named) : base;
    for (const [index, e] of edits) {
      const before = a.segments[index]?.chord;
      const chord = e.rootPc === null || e.quality === null ? null : { rootPc: e.rootPc, quality: e.quality, bassPc: before?.bassPc ?? e.rootPc };
      a = withChord(a, index, chord, named);
    }
    return a;
  }, [base, keyOverride, edits]);
  const key = (keyOverride && parseKey(keyOverride)) || base.key.key;
  const sections = useMemo(() => songSections(analysis), [analysis]);

  // ---- playback: notes through the app's piano, or the audio file itself ----
  const notePlayer = useRef(new TakePlayer());
  const audio = useRef<HTMLAudioElement | null>(null);
  const frame = useRef(0);
  const loopRef = useRef<Loop | null>(null);
  loopRef.current = loop;

  const halt = useCallback(() => {
    notePlayer.current.stop();
    audio.current?.pause();
    cancelAnimationFrame(frame.current);
  }, []);

  const start = useCallback(
    (from: number) => {
      halt();
      const l = loopRef.current;
      const inside = l && from >= l.a && from < l.b;
      const begin = l && !inside ? l.a : from;
      const end = l ? l.b : duration;
      setPlaying(true);
      if (song.audioUrl) {
        const el = (audio.current ??= new Audio(song.audioUrl));
        el.currentTime = begin;
        void el.play();
        const tick = () => {
          const t = el.currentTime;
          const now = loopRef.current;
          if (now && t >= now.b) el.currentTime = now.a;
          else if (el.ended || t >= duration) {
            setTime(duration);
            return setPlaying(false);
          }
          setTime(el.currentTime);
          frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
        return;
      }
      notePlayer.current.play(
        base.notes,
        duration,
        begin,
        setTime,
        () => {
          if (loopRef.current && end === loopRef.current.b) start(loopRef.current.a);
          else setPlaying(false);
        },
        end,
      );
    },
    [base.notes, duration, halt, song.audioUrl],
  );
  const stop = () => {
    halt();
    setPlaying(false);
  };
  useEffect(
    () => () => {
      halt();
      audio.current = null;
    },
    [halt],
  );

  const seek = (sec: number) => {
    setTime(sec);
    if (playing) start(sec);
  };

  const playHere = () => start(time >= duration - 0.05 ? loop?.a ?? 0 : time);

  // ---- the chord shown on the keyboard: the one picked, else the one playing ----
  const shown = selected ?? segmentAt(analysis, time);
  const seg = shown >= 0 ? analysis.segments[shown] ?? null : null;
  const marks = useMemo(() => {
    const m = new Map<MidiNote, KeyMark>();
    if (seg?.chord) for (const n of chordMidi(seg)) m.set(n, 'target');
    return m;
  }, [seg]);
  const labelFor = useMemo(() => noteLabeller(key, settings.noteNaming), [key, settings.noteNaming]);
  const size = Math.max(49, settings.keyboardSize) as KeyboardSize;

  const setEdit = (index: number, e: Edit | null) =>
    setEdits((prev) => {
      const next = new Map(prev);
      if (e) next.set(index, e);
      else next.delete(index);
      return next;
    });

  const setPoint = (which: 'a' | 'b') => {
    const t = Math.round(time * 100) / 100;
    setLoop((l) => {
      if (which === 'a') return { a: t, b: l && l.b > t + 0.5 ? l.b : Math.min(duration, t + 4) };
      return { a: l && l.a < t - 0.5 ? l.a : Math.max(0, t - 4), b: t };
    });
  };
  const loopSection = (i: number) => {
    const sec = sections[i]!;
    setLoop({ a: sec.start, b: sec.end });
    setSelected(null);
    setTime(sec.start);
    start(sec.start);
  };

  const sel = selected === null ? null : analysis.segments[selected] ?? null;
  const sure = base.key.confidence >= 0.7 ? 'clear' : base.key.confidence >= 0.45 ? 'likely' : 'a guess';
  const guessy = base.source === 'audio';
  const chordCount = analysis.segments.filter((x) => x.chord).length;

  return (
    <motion.div className={r.take} variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <Card padding="lg" className={r.overview}>
          <div className={r.keyRow}>
            <div>
              <span className="ui-eyebrow">{base.title || 'Song'}</span>
              <div className={r.keyName} data-testid="song-key">
                {pretty(keyLabel(key))}
              </div>
              <span className="ui-muted">{keyOverride ? 'You picked this key.' : `The app heard this (${sure}).`}</span>
              {guessy && (
                <div>
                  <Badge tone="warn" data-testid="song-guess">
                    Audio file: the chords are a guess
                  </Badge>
                </div>
              )}
            </div>
            <Select label="Change key" data-testid="song-key-select" value={keyOverride ?? ''} groups={KEY_GROUPS} onChange={(e) => setKeyOverride(e.target.value || null)} />
          </div>
          <ul className={r.summary} data-testid="song-summary">
            {analysis.summary.sentences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className={r.transport}>
            {playing ? (
              <Button variant="primary" onClick={stop} data-testid="song-stop">
                ■ Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={playHere} data-testid="song-play">
                ▶ Play
              </Button>
            )}
            <span className={`ui-muted ${r.clock}`} data-testid="song-time">
              {formatTime(time * 1000)} / {formatTime(duration * 1000)}
            </span>
            <span className={r.spacer} />
            <Button variant="ghost" onClick={() => { stop(); onClose(); }} data-testid="song-close">
              Open another song
            </Button>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="md">
          <div className={r.sectionHead}>
            <span className="ui-eyebrow">Chords in the song</span>
            <span className="ui-muted">{chordCount === 0 ? 'No chords were found.' : 'Tap a chord to hear it, see its notes, or fix it.'}</span>
          </div>
          <div className={r.lane} data-testid="song-chords" role="list">
            {loop && <div className={s.loopBand} style={{ left: `${(loop.a / duration) * 100}%`, width: `${((loop.b - loop.a) / duration) * 100}%` }} aria-hidden data-testid="song-loop-band" />}
            {analysis.segments.map((x, i) => (
              <button
                key={`${x.start}-${i}`}
                type="button"
                role="listitem"
                className={r.chord}
                style={{ left: `${(x.start / duration) * 100}%`, width: `${((x.end - x.start) / duration) * 100}%` }}
                data-empty={!x.chord || undefined}
                data-edited={x.edited || undefined}
                data-selected={selected === i || undefined}
                data-out={(x.chord && !x.chord.inKey) || undefined}
                aria-pressed={selected === i}
                title={x.chord ? `${x.chord.name} (${x.chord.number}) at ${formatTime(x.start * 1000)}` : 'No chord here'}
                onClick={() => {
                  setSelected(i);
                  if (x.chord) void playChord(chordMidi(x));
                  setTime(x.start);
                  if (playing) start(x.start);
                }}
                data-testid="song-chord"
              >
                <span className={r.symbol}>{x.chord ? (settings.noteNaming === 'sargam' ? x.chord.sargam : x.chord.symbol) : '·'}</span>
                {x.chord && <span className={r.number}>{x.chord.number}</span>}
                {x.chord && settings.noteNaming === 'both' && <span className={r.number}>{x.chord.sargam}</span>}
              </button>
            ))}
            <div className={r.playhead} style={{ left: `${(time / duration) * 100}%` }} aria-hidden />
          </div>
          <input
            type="range"
            className={s.scrub}
            min={0}
            max={duration}
            step={0.05}
            value={time}
            aria-label="Position in the song"
            data-testid="song-scrub"
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div className={s.loopRow} data-testid="song-loop">
            <span className="ui-field-label">Loop</span>
            <Button size="sm" variant="secondary" onClick={() => setPoint('a')} data-testid="loop-a">
              Start here
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPoint('b')} data-testid="loop-b">
              End here
            </Button>
            {loop ? (
              <>
                <Badge tone="accent" data-testid="loop-range">
                  {formatTime(loop.a * 1000)} to {formatTime(loop.b * 1000)}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setLoop(null)} data-testid="loop-clear">
                  Clear loop
                </Button>
              </>
            ) : (
              <span className="ui-muted">Move the slider to a spot, then press Start here and End here. Play repeats just that part.</span>
            )}
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="sm">
          <div className={s.boardHead}>
            <div>
              <span className="ui-eyebrow">{selected !== null ? 'Chord you picked' : playing ? 'Playing now' : 'Chord at the playhead'}</span>
              <div className={s.nowChord} data-testid="song-now">
                {seg?.chord ? (
                  <>
                    {chordName(seg, settings.noteNaming)} <span className="ui-muted">({seg.chord.number})</span>
                  </>
                ) : (
                  '–'
                )}
              </div>
              {seg?.chord && <span className="ui-muted">{seg.chord.name}: {seg.chord.notes.join(' ')}. Play the glowing keys along with it.</span>}
            </div>
            {selected !== null && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)} data-testid="song-follow">
                Follow the song again
              </Button>
            )}
          </div>
          <LiveKeyboard size={size} labelFor={labelFor} marks={marks} />
        </Card>
      </motion.div>

      {sel && selected !== null && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card padding="md" className={r.fix} data-testid="song-fix">
            <div>
              <span className="ui-eyebrow">
                At {formatTime(sel.start * 1000)}, for {(sel.end - sel.start).toFixed(1)} seconds
              </span>
              <div className={r.fixName}>
                {chordName(sel, settings.noteNaming)}{' '}
                {sel.chord && <Badge tone={sel.chord.inKey ? 'neutral' : 'warn'}>{sel.chord.inKey ? `${sel.chord.number} in the key` : `${sel.chord.number}, outside the key`}</Badge>}
                {sel.edited && <Badge tone="accent">Set by you</Badge>}
              </div>
              {sel.chord && <span className="ui-muted">{sel.chord.name}: {sel.chord.notes.join(' ')}</span>}
            </div>
            <div className={r.fixControls}>
              <Select
                label="Root"
                data-testid="song-fix-root"
                value={sel.chord ? String(sel.chord.rootPc) : ''}
                options={[{ value: '', label: 'No chord' }, ...Array.from({ length: 12 }, (_, pc) => ({ value: String(pc), label: pretty(spellName(pc, key)) }))]}
                onChange={(e) => {
                  const v = e.target.value;
                  setEdit(selected, v === '' ? { rootPc: null, quality: null } : { rootPc: Number(v), quality: sel.chord?.quality ?? 'major' });
                }}
              />
              <Select
                label="Type"
                data-testid="song-fix-quality"
                value={sel.chord?.quality ?? 'major'}
                disabled={!sel.chord}
                options={QUALITY_OPTIONS}
                onChange={(e) => sel.chord && setEdit(selected, { rootPc: sel.chord.rootPc, quality: e.target.value as ChordQuality })}
              />
              {sel.alternatives.length > 0 && (
                <div className={r.alts}>
                  <span className="ui-field-label">Or maybe</span>
                  <div className={r.altRow}>
                    {sel.alternatives.slice(0, 3).map((alt) => (
                      <Button key={alt.symbol} size="sm" variant="ghost" onClick={() => setEdit(selected, { rootPc: alt.rootPc, quality: alt.quality })}>
                        {alt.symbol}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" variant="secondary" disabled={!sel.chord} onClick={() => sel.chord && void playChord(chordMidi(sel))} data-testid="song-fix-hear">
                ▶ Hear it
              </Button>
              {sel.edited && (
                <Button size="sm" variant="ghost" onClick={() => setEdit(selected, null)} data-testid="song-fix-reset">
                  Use the app's guess
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {sections.length > 0 && (
        <motion.div variants={fadeUp}>
          <Card padding="md">
            <div className={r.sectionHead}>
              <span className="ui-eyebrow">Section by section</span>
              <span className="ui-muted">Loop a section to practise just that part.</span>
            </div>
            <ol className={s.sections} data-testid="song-sections">
              {sections.map((sec, i) => (
                <li key={sec.number} className={s.section} data-testid="song-section">
                  <div className={s.sectionTop}>
                    <strong>Section {sec.number}</strong>
                    <span className="ui-muted">
                      {formatTime(sec.start * 1000)} to {formatTime(sec.end * 1000)}
                    </span>
                    <span className={r.spacer} />
                    <Button size="sm" variant="secondary" onClick={() => loopSection(i)} data-testid="section-loop">
                      ⟲ Loop this
                    </Button>
                  </div>
                  <div className={s.sectionChords}>
                    <span>{sec.numbers}</span>
                    <span className="ui-muted">{sec.symbols}</span>
                  </div>
                  <p className="ui-muted" data-testid="section-line">
                    {sec.line}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
