/**
 * Jam-along: pick a progression and a key, and a backing band (chords, bass
 * and drums) plays it at your tempo while you improvise. The chord playing
 * now is shown big with the next one coming, and the keyboard lights the
 * notes that fit: the chord's own notes, and dots for the rest of the key.
 */

import type { UserSettings } from '@music/contracts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, noteToString, parseKey, pretty, spellInKey, type MidiNote } from '@music/theory';
import { Badge, Button, Card, SegmentedControl, Select, Swap, Switch, fadeUp, spring, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../audio/sound.js';
import { useNoteInput, useNoteOn } from '../input/NoteInput.js';
import { startBand, type Band, type BandConfig } from '../jam/band.js';
import { PRESETS, STYLES, chordsFor, fitFor, fitOf, parseProgression, position, voiceChord, type JamStyle } from '../jam/logic.js';
import { KEYBOARD_RANGES, type KeyboardSize } from '../keyboard/layout.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { JamSetup } from '../router.js';
import s from '../jam/jam.module.css';

const KEY_GROUPS = (['major', 'minor'] as const).map((mode) => ({
  label: mode === 'major' ? 'Major keys' : 'Minor keys',
  options: COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) })),
}));

const PRESET_OPTIONS = [...PRESETS.map((p) => ({ value: p.id, label: `${pretty(p.label)}: ${p.note}` })), { value: 'custom', label: 'Your own…' }];
const STYLE_OPTIONS = STYLES.map((st) => ({ value: st.id, label: st.label }));
const LENGTH_OPTIONS = [
  { value: '2', label: '2 beats' },
  { value: '4', label: '1 bar' },
  { value: '8', label: '2 bars' },
] as const;
type Light = 'chord' | 'scale' | 'off';
const LIGHT_OPTIONS: Array<{ value: Light; label: string }> = [
  { value: 'chord', label: 'Chord notes' },
  { value: 'scale', label: '+ key scale' },
  { value: 'off', label: 'Off' },
];

const MIN_BPM = 50;
const MAX_BPM = 180;

function initialPreset(setup: JamSetup): { id: string; custom: string } {
  if (!setup.numerals) return { id: PRESETS[0]!.id, custom: '' };
  const match = PRESETS.find((p) => p.numerals.join(',') === setup.numerals!.join(','));
  return match ? { id: match.id, custom: '' } : { id: 'custom', custom: setup.numerals.join(' ') };
}

/** "b7" → "♭7": pretty() only spells accidentals on note letters. */
const numeralText = (n: string) => pretty(n).replace(/(^|[^A-Za-z])b(?=[1-7IViv])/g, '$1♭');

const percent = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`);

export function JamPage({ setup, settings }: { setup: JamSetup; settings: UserSettings }) {
  const input = useNoteInput();
  const first = useMemo(() => initialPreset(setup), [setup]);
  const firstPreset = PRESETS.find((p) => p.id === first.id);
  const [presetId, setPresetId] = useState(first.id);
  const [custom, setCustom] = useState(first.custom || '1 4 6 5');
  const [keyText, setKeyText] = useState(() => (setup.key && parseKey(setup.key) ? keyName(parseKey(setup.key)!) : settings.currentKey));
  const [style, setStyle] = useState<JamStyle>(setup.style ?? firstPreset?.style ?? 'pop');
  const [bpm, setBpm] = useState(Math.min(MAX_BPM, Math.max(MIN_BPM, setup.bpm ?? 90)));
  const [beatsPerChord, setBeatsPerChord] = useState(setup.beatsPerChord ?? firstPreset?.beatsPerChord ?? 4);
  const [parts, setParts] = useState({ chords: true, bass: true, drums: true });
  const [light, setLight] = useState<Light>('chord');
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const [preview, setPreview] = useState(0);
  const [stats, setStats] = useState({ total: 0, inKey: 0, chord: 0 });

  const key = useMemo(() => parseKey(keyText) ?? C_MAJOR, [keyText]);
  const preset = PRESETS.find((p) => p.id === presetId);
  const parsed = useMemo(() => (preset ? { chords: chordsFor(preset.numerals, key), bad: [] } : parseProgression(custom, key)), [preset, custom, key]);
  const chords = parsed.chords;

  const config = useMemo<BandConfig>(() => ({ chords, style, bpm, beatsPerChord, parts }), [chords, style, bpm, beatsPerChord, parts]);
  const band = useRef<Band | null>(null);
  useEffect(() => band.current?.update(config), [config]);
  useEffect(() => () => band.current?.stop(), []);

  const start = () => {
    if (chords.length === 0) return;
    band.current?.stop();
    setStats({ total: 0, inKey: 0, chord: 0 });
    setBeat(-4);
    band.current = startBand(config, setBeat);
    setPlaying(true);
  };
  const stop = () => {
    band.current?.stop();
    band.current = null;
    setPlaying(false);
    setBeat(null);
  };

  const pos = playing && beat !== null ? position(beat, chords.length, beatsPerChord) : null;
  const index = pos ? pos.index : Math.min(preview, Math.max(0, chords.length - 1));
  const current = chords[index] ?? null;
  const next = chords.length > 0 ? chords[(index + 1) % chords.length]! : null;
  const fit = useMemo(() => fitFor(current?.chord ?? null, key), [current, key]);

  // Count how the notes played fit, while the band is playing.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const counting = playing && beat !== null && beat >= 0;
  useNoteOn((note) => {
    if (!counting) return;
    const kind = fitOf(note, fitRef.current);
    setStats((st) => ({ total: st.total + 1, inKey: st.inKey + (kind === 'outside' ? 0 : 1), chord: st.chord + (kind === 'chord' ? 1 : 0) }));
  });

  const size = settings.keyboardSize as KeyboardSize;
  const labelFor = useMemo(() => noteLabeller(key, settings.noteNaming), [key, settings.noteNaming]);
  const marks = useMemo(() => {
    const m = new Map<MidiNote, KeyMark>();
    if (light === 'off' || !current) return m;
    const { low, high } = KEYBOARD_RANGES[size];
    for (let n = low; n <= high; n++) {
      const kind = fitOf(n, fit);
      if (kind === 'chord') m.set(n, input.heldSet.has(n) ? 'good' : 'target');
      else if (kind === 'scale' && light === 'scale') m.set(n, 'fit');
    }
    return m;
  }, [light, current, size, fit, input.heldSet]);

  const noteNames = current ? current.chord.pitchClasses.map((pc) => pretty(noteToString(spellInKey(pc, key)))).join(' · ') : '';
  const beatInBar = beat !== null && beat >= 0 ? beat % 4 : null;
  const countIn = beat !== null && beat < 0 ? beat + 5 : null;

  // A preset brings the style and chord length it is usually played with.
  const pickPreset = (id: string) => {
    setPresetId(id);
    setPreview(0);
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      setStyle(p.style ?? 'pop');
      setBeatsPerChord(p.beatsPerChord ?? 4);
    }
  };

  const hearChord = (i: number) => {
    setPreview(i);
    const c = chords[i];
    if (c && !playing) void playChord(voiceChord(c.chord, null), 1.4);
  };

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className={s.head}>
        <div>
          <span className="ui-eyebrow">Jam-along</span>
          <h1 className="ui-title">Play with the band</h1>
          <p className={`ui-muted ${s.lead}`}>
            Pick some chords and a key. The band plays them round and round while you make things up on top. Lit keys are the notes of the chord playing now: they always sound right.
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className={s.controls}>
          <Select label="Chords" data-testid="jam-preset" value={presetId} options={PRESET_OPTIONS} onChange={(e) => pickPreset(e.target.value)} />
          {presetId === 'custom' && (
            <label className="ui-field">
              <span className="ui-field-label">Your chords, as numbers</span>
              <input className={s.input} data-testid="jam-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="1 5 6 4" spellCheck={false} />
            </label>
          )}
          <Select label="Key" data-testid="jam-key" value={keyName(key)} groups={KEY_GROUPS} onChange={(e) => setKeyText(e.target.value)} />
          <Select label="Style" data-testid="jam-style" value={style} options={STYLE_OPTIONS} onChange={(e) => setStyle(e.target.value as JamStyle)} />
          <div className="ui-field">
            <span className="ui-field-label">Each chord lasts</span>
            <div data-testid="jam-length">
              <SegmentedControl
                label="Each chord lasts"
                value={String(beatsPerChord) as (typeof LENGTH_OPTIONS)[number]['value']}
                options={LENGTH_OPTIONS}
                onChange={(v) => setBeatsPerChord(Number(v))}
              />
            </div>
          </div>
          <label className={`ui-field ${s.tempo}`}>
            <span className="ui-field-label">
              Speed <span className={s.bpm} data-testid="jam-bpm">{bpm}</span> beats a minute
            </span>
            <input type="range" min={MIN_BPM} max={MAX_BPM} step={2} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} data-testid="jam-tempo" aria-label="Speed in beats a minute" />
          </label>
        </Card>
      </motion.div>
      {parsed.bad.length > 0 && (
        <p className={s.error} role="alert" data-testid="jam-bad">
          {parsed.bad.map(pretty).join(', ')} {parsed.bad.length === 1 ? "isn't a chord number" : "aren't chord numbers"}. Use 1 to 7 (add m, 7 or maj7 if you like), or Roman numerals like IV.
        </p>
      )}

      <motion.div variants={fadeUp}>
        <Card highlight padding="lg" className={s.stage} data-playing={playing}>
          <div className={s.now}>
            <span className="ui-eyebrow">{playing ? (countIn ? 'Get ready' : 'Playing now') : 'First chord'}</span>
            {countIn ? (
              <Swap value={`count-${countIn}`} className={`ui-display ${s.symbol}`}>
                <span className={s.symbolText} data-testid="jam-count">{countIn}</span>
              </Swap>
            ) : (
              <Swap value={current ? `${index}-${current.chord.symbol}` : 'none'} className={`ui-display ${s.symbol}`}>
                <span className={s.symbolText} data-testid="jam-chord">
                  {current ? pretty(current.chord.symbol) : '–'}
                </span>
              </Swap>
            )}
            {current && (
              <span className={s.sub}>
                <Badge tone="neutral" data-testid="jam-numeral">
                  {numeralText(current.numeral)} in {pretty(keyLabel(key))}
                </Badge>
                <span className="ui-muted">{noteNames}</span>
              </span>
            )}
          </div>

          <div className={s.side}>
            <div className={s.beats} aria-hidden>
              {[0, 1, 2, 3].map((b) => (
                <span key={b} className={s.dot} data-on={beatInBar === b || (countIn !== null && countIn - 1 === b) || undefined} data-one={b === 0 || undefined} />
              ))}
            </div>
            {next && chords.length > 1 && (
              <div className={s.next} data-soon={pos && pos.beatsLeft === 1 ? true : undefined}>
                <span className="ui-eyebrow">Coming up</span>
                <span className={s.nextChord} data-testid="jam-next">
                  {pretty(next.chord.symbol)} <span className="ui-muted">({numeralText(next.numeral)})</span>
                </span>
                {pos && !pos.countIn && (
                  <span className={`ui-muted ${s.small}`}>
                    in {pos.beatsLeft} {pos.beatsLeft === 1 ? 'beat' : 'beats'}
                  </span>
                )}
              </div>
            )}
            <Button size="lg" variant={playing ? 'secondary' : 'primary'} onClick={playing ? stop : start} disabled={chords.length === 0} data-testid="jam-play">
              {playing ? '■ Stop' : '▶ Start the band'}
            </Button>
          </div>

          <div className={s.strip} role="list" aria-label="The progression">
            {chords.map((c, i) => {
              const on = i === index;
              return (
                <button key={`${i}-${c.numeral}`} type="button" role="listitem" className={s.chip} data-on={on || undefined} onClick={() => hearChord(i)} data-testid={`jam-chip-${i}`}>
                  {on && <motion.span layoutId="jam-chip" className={s.chipPill} transition={spring.snappy} />}
                  <span className={s.chipText}>
                    <strong>{pretty(c.chord.symbol)}</strong>
                    <span className="ui-muted">{numeralText(c.numeral)}</span>
                  </span>
                  {on && pos && !pos.countIn && <span className={s.fill} style={{ ['--progress' as string]: (pos.beatInChord + 1) / beatsPerChord }} />}
                </button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="sm">
          <div className={s.boardHead}>
            <div className="ui-field">
              <span className="ui-field-label">Light up</span>
              <div data-testid="jam-light">
                <SegmentedControl label="Light up" value={light} options={LIGHT_OPTIONS} onChange={setLight} />
              </div>
            </div>
            <div className={s.parts}>
              <Switch label="Chords" checked={parts.chords} onChange={(v) => setParts((p) => ({ ...p, chords: v }))} />
              <Switch label="Bass" checked={parts.bass} onChange={(v) => setParts((p) => ({ ...p, bass: v }))} />
              <Switch label="Drums" checked={parts.drums} onChange={(v) => setParts((p) => ({ ...p, drums: v }))} />
            </div>
          </div>
          <LiveKeyboard size={size} labelFor={labelFor} marks={marks} />
          <div className={s.footer}>
            <p className={`ui-muted ${s.small}`}>
              {light === 'scale' ? 'Glowing keys are the chord. Dots are the rest of the key: they fit too, but lean on the glowing ones. ' : 'Glowing keys are the chord playing now. '}
              Try your left hand on the chord's lowest note, and a tune in the right.
            </p>
            <div className={s.stats} data-testid="jam-stats" aria-live="polite">
              <span>
                <strong>{stats.total}</strong> <span className="ui-muted">notes</span>
              </span>
              <span>
                <strong>{percent(stats.inKey, stats.total)}</strong> <span className="ui-muted">in the key</span>
              </span>
              <span>
                <strong>{percent(stats.chord, stats.total)}</strong> <span className="ui-muted">chord notes</span>
              </span>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
