/**
 * One piece: what it's made of (key, chords bar by bar, melody, hard bars),
 * then the practice player for the hand and bars you pick. Click a bar to
 * loop it; click another to loop everything between.
 */

import type { UserSettings } from '@music/contracts';
import { keyLabel, keyScale, noteToString, pretty } from '@music/theory';
import { Badge, Button, Card, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';
import { playEvents } from '../audio/sound.js';
import { KEYBOARD_RANGES, type KeyboardSize } from '../keyboard/layout.js';
import { noteLabeller } from '../keyboard/labels.js';
import { analyse, type Analysis } from '../pieces/analyse.js';
import { barCount, barOf, resplit, type Piece } from '../pieces/piece.js';
import { Practice } from '../pieces/Practice.js';
import { foldIntoRange, troubleBars, type HandChoice, type LoopResult, type Selection } from '../pieces/practice.js';
import { findPiece, saveImported } from '../pieces/storage.js';
import { href } from '../router.js';
import { PIECE_DRILLS } from './PiecesPage.js';
import l from '../lesson/lesson.module.css';
import s from '../pieces/pieces.module.css';

export function PiecePage({ id, settings }: { id: string; settings: UserSettings }) {
  const [piece, setPiece] = useState(() => findPiece(id));
  if (!piece) {
    return (
      <Card padding="lg" className={l.errorCard} data-testid="piece-missing">
        <h2 className="ui-heading">This piece isn't here</h2>
        <p className="ui-muted">Pieces you open are kept in the browser you opened them in. Open the MIDI file again to practise it here.</p>
        <div>
          <Button variant="secondary" onClick={() => (location.hash = href.pieces)}>
            All pieces
          </Button>
        </div>
      </Card>
    );
  }
  return <PieceView key={piece.id} piece={piece} settings={settings} onChange={setPiece} />;
}

/** Which notes the left hand plays, for files that don't keep the hands on separate tracks. */
const SPLITS = [
  { value: 'file', label: 'As saved in the file' },
  { value: '55', label: 'Below G3' },
  { value: '60', label: 'Below middle C (C4)' },
  { value: '64', label: 'Below E4' },
  { value: '67', label: 'Below G4' },
];

const MELODY_BARS = 8;

function PieceView({ piece: original, settings, onChange }: { piece: Piece; settings: UserSettings; onChange: (p: Piece) => void }) {
  const size = settings.keyboardSize as KeyboardSize;
  const range = KEYBOARD_RANGES[size];
  const analysis = useMemo(() => analyse(original), [original]);
  // Notes your keyboard doesn't have are moved by octaves so you can play them.
  const { piece, moved } = useMemo(() => foldIntoRange(original, range.low, range.high), [original, range.low, range.high]);
  const bars = barCount(piece);
  const firstBar = piece.pickup > 0 ? 0 : 1;

  const [sel, setSel] = useState<Selection>({ hands: 'right', fromBar: firstBar, toBar: Math.min(bars, firstBar + 3) });
  const [nowBar, setNowBar] = useState<number | null>(null);
  const [trouble, setTrouble] = useState<Map<number, number>>(new Map());
  const [split, setSplit] = useState('file');
  const [fileHands] = useState(original);

  const pickBar = (bar: number) =>
    setSel((x) => {
      // A single bar is chosen and you click another: loop everything between them.
      if (x.fromBar === x.toBar && bar !== x.fromBar) return { ...x, fromBar: Math.min(bar, x.fromBar), toBar: Math.max(bar, x.fromBar) };
      return { ...x, fromBar: bar, toBar: bar };
    });

  const onLoop = useCallback((r: LoopResult) => {
    setTrouble((t) => {
      const next = new Map(t);
      for (const [bar, n] of r.troubleByBar) next.set(bar, (next.get(bar) ?? 0) + n);
      return next;
    });
  }, []);
  const onHands = useCallback((hands: HandChoice) => setSel((x) => ({ ...x, hands })), []);
  const worst = troubleBars(trouble);

  const changeSplit = (value: string) => {
    setSplit(value);
    const next = value === 'file' ? fileHands : resplit(fileHands, Number(value));
    if (next.source === 'import') saveImported(next);
    onChange(next);
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className={s.page}>
      <motion.div variants={fadeUp} className={l.playerHead}>
        <a href={href.pieces} className={l.back} data-testid="back">
          ← Pieces
        </a>
        <div className={l.titleBlock}>
          <h1 className="ui-title" data-testid="piece-title">
            {piece.title}
          </h1>
          <span className="ui-muted">{[piece.composer, piece.about].filter(Boolean).join(' · ')}</span>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Overview piece={piece} analysis={analysis} settings={settings} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="lg" className={s.page}>
          <div className={s.between}>
            <div>
              <h2 className="ui-heading">Bars and chords</h2>
              <span className={`ui-muted ${l.small}`}>
                Each tile is one bar: its chord name, and its Roman numeral (the chord's place in the key). Click a bar to practise it; click another to practise everything between.
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSel((x) => ({ ...x, fromBar: firstBar, toBar: bars }))} data-testid="whole-piece">
              Whole piece
            </Button>
          </div>
          <BarMap piece={piece} analysis={analysis} sel={sel} nowBar={nowBar} trouble={trouble} onPick={pickBar} />
          <div className={s.legend}>
            <span>
              <span className={s.swatch} style={{ borderColor: 'var(--warn)' }} />
              Tricky bar
            </span>
            <span>
              <span className={s.swatch} style={{ borderColor: 'var(--bad)' }} />
              Hard bar
            </span>
            <span>Red numbers: your slips there so far</span>
          </div>
          {worst.length > 0 && (
            <div className={s.row} data-testid="trouble">
              <span className="ui-muted">Most slips in bar{worst.length > 1 ? 's' : ''} {worst.join(', ')}.</span>
              <Button size="sm" variant="secondary" onClick={() => setSel((x) => ({ ...x, fromBar: worst[0]!, toBar: worst[0]! }))} data-testid="loop-worst">
                Loop bar {worst[0]}
              </Button>
            </div>
          )}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="lg" className={s.page}>
          <div className={s.between}>
            <div>
              <h2 className="ui-heading">
                Practise {sel.fromBar === sel.toBar ? `bar ${sel.fromBar}` : `bars ${sel.fromBar} to ${sel.toBar}`}
              </h2>
              <span className={`ui-muted ${l.small}`}>Learn each hand alone first, then put them together. Short loops, played clean, beat long ones played fast.</span>
            </div>
            {piece.source === 'import' && <Select label="Left hand plays" options={SPLITS} value={split} onChange={(e) => changeSplit(e.target.value)} />}
          </div>
          {moved > 0 && (
            <span className={`ui-muted ${l.small}`} data-testid="folded">
              {moved} note{moved === 1 ? ' is' : 's are'} outside your {size}-key keyboard, so {moved === 1 ? 'it is' : 'they are'} moved by an octave to fit. You can change the keyboard size in Settings.
            </span>
          )}
          <Practice piece={piece} musicKey={analysis.key.key} size={size} settings={settings} sel={sel} onHands={onHands} onBar={setNowBar} onLoop={onLoop} />
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className={s.row}>
        <span className="ui-muted">Hard part? Train it in the Hands tab:</span>
        {PIECE_DRILLS.map((d) => (
          <Button key={d.id} size="sm" variant="ghost" onClick={() => (location.hash = href.hand(d.id))}>
            {d.title}
          </Button>
        ))}
      </motion.div>
    </motion.div>
  );
}

/** Key, scale, tempo and time, in words a beginner can use. */
function Overview({ piece, analysis, settings }: { piece: Piece; analysis: Analysis; settings: UserSettings }) {
  const { key, confidence, runnerUp } = analysis.key;
  const labelFor = useMemo(() => noteLabeller(key, settings.noteNaming), [key, settings.noteNaming]);
  const scale = keyScale(key).map((n) => pretty(noteToString(n)));
  const melody = analysis.melody.filter((n) => barOf(piece, n.start) <= (piece.pickup > 0 ? MELODY_BARS - 1 : MELODY_BARS));
  const byBar = new Map<number, typeof melody>();
  for (const n of melody) {
    const b = barOf(piece, n.start);
    byBar.set(b, [...(byBar.get(b) ?? []), n]);
  }
  const playMelody = () => {
    const spb = 60 / piece.bpm;
    const start = melody[0]?.start ?? 0;
    playEvents(melody.map((n) => ({ midi: n.midi, at: (n.start - start) * spb, dur: Math.min(n.dur * spb, 1.5) })));
  };
  const [ts0, ts1] = piece.timeSignature;

  return (
    <Card padding="lg" className={s.page} data-testid="overview">
      <div className={s.facts}>
        <div className={s.fact}>
          <span className="ui-eyebrow">Key</span>
          <span className={`${s.factValue} ui-gradient-text`} data-testid="piece-key">
            {pretty(keyLabel(key))}
          </span>
          <span className={`ui-muted ${l.small}`}>
            {confidence >= 0.5 ? 'The home note is ' : 'Probably; it could also be ' + pretty(keyLabel(runnerUp)) + '. The home note is '}
            {pretty(noteToString(key.tonic))}. The piece mostly uses these notes:
          </span>
          <span className={s.scale}>
            {scale.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </div>
        <div className={s.fact}>
          <span className="ui-eyebrow">Time</span>
          <span className={s.factValue}>
            {ts0}/{ts1}
          </span>
          <span className={`ui-muted ${l.small}`}>
            {ts0} beats of {ts1 === 4 ? 'quarter notes' : ts1 === 8 ? 'eighth notes' : ts1 === 2 ? 'half notes' : `1/${ts1} notes`} in every bar
            {piece.pickup > 0 ? ', with an upbeat (bar 0) before bar 1.' : '.'}
          </span>
        </div>
        <div className={s.fact}>
          <span className="ui-eyebrow">Full speed</span>
          <span className={s.factValue}>{piece.bpm}</span>
          <span className={`ui-muted ${l.small}`}>quarter notes a minute. You'll start slower than this.</span>
        </div>
      </div>

      <div className={s.page} style={{ gap: 'var(--space-2)' }}>
        <div className={s.between}>
          <div>
            <span className="ui-eyebrow">Melody</span>
            <span className={`ui-muted ${l.small}`}> · the top line of the right hand{byBar.size < analysis.melody.length ? `, first ${MELODY_BARS} bars` : ''}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={playMelody} data-testid="play-melody">
            ▶ Hear the melody
          </Button>
        </div>
        <div className={s.melody} data-testid="melody">
          {[...byBar.entries()].map(([bar, notes]) => (
            <span key={bar} style={{ display: 'contents' }}>
              <span className={s.melodyBar}>{bar}</span>
              {notes.map((n, i) => (
                <span key={i}>{labelFor(n.midi)}</span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function BarMap({
  piece,
  analysis,
  sel,
  nowBar,
  trouble,
  onPick,
}: {
  piece: Piece;
  analysis: Analysis;
  sel: Selection;
  nowBar: number | null;
  trouble: ReadonlyMap<number, number>;
  onPick: (bar: number) => void;
}) {
  return (
    <div className={s.bars} data-testid="bar-map">
      {analysis.bars.map((b) => {
        const chords = analysis.chords.filter((c) => c.bar === b.bar);
        const selected = b.bar >= sel.fromBar && b.bar <= sel.toBar;
        const slips = trouble.get(b.bar) ?? 0;
        return (
          <button
            key={b.bar}
            type="button"
            className={s.bar}
            data-level={b.level}
            data-selected={selected || undefined}
            data-now={nowBar === b.bar || undefined}
            onClick={() => onPick(b.bar)}
            title={b.reasons.length ? `Bar ${b.bar}: ${b.reasons.join(', ')}` : `Bar ${b.bar}`}
            data-testid={`bar-${b.bar}`}
          >
            <span className={s.barNum}>
              <span>{b.bar === 0 ? 'Upbeat' : `Bar ${b.bar}`}</span>
            </span>
            <span className={s.chord}>{chords.length ? chords.map((c) => pretty(c.chord.symbol)).join(' · ') : '–'}</span>
            <span className={s.roman}>{chords.length ? chords.map((c) => pretty(c.roman)).join(' · ') : 'no clear chord'}</span>
            {b.reasons.length > 0 && (
              <Badge tone={b.level === 2 ? 'bad' : 'warn'} style={{ justifySelf: 'start', fontSize: '0.68rem' }}>
                {b.reasons[0]}
              </Badge>
            )}
            {slips > 0 && <span className={s.trouble}>{slips}</span>}
          </button>
        );
      })}
    </div>
  );
}
