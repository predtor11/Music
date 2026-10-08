/**
 * One chart, ready for the band: change key in one tap, switch between chord
 * names and numbers, see the capo hint for the guitarist, click a chord to
 * hear it on the keyboard, and print, save as PDF or share it.
 */

import type { ChartView, ChordChart, UserSettings } from '@music/contracts';
import { CARRY_ON, bestCapo, chartSymbols, chordLongName, encodeChart, renderChord, shiftKey, transposeChart } from '@music/charts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, parseKey, pitchClass, pretty } from '@music/theory';
import { Badge, Button, Card, SegmentedControl, Select, Swap, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { playChord } from '../audio/sound.js';
import { useNoteInput } from '../input/NoteInput.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { ChartGrid, type ChordRef } from './ChartGrid.js';
import { chartAsText } from './display.js';
import s from './charts.module.css';

const VIEW_OPTIONS: Array<{ value: ChartView; label: string }> = [
  { value: 'names', label: 'Chords' },
  { value: 'nashville', label: 'Numbers' },
  { value: 'roman', label: 'Roman' },
  { value: 'sargam', label: 'Sa Re Ga' },
];

/** Keys in the chart's own mode, so a minor song stays minor when it moves. */
function keyOptions(mode: 'major' | 'minor') {
  return COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) }));
}

/** Every chord position in reading order, for Previous and Next. */
function chordRefs(chart: ChordChart): ChordRef[] {
  return chart.sections.flatMap((sec, section) => sec.bars.flatMap((bar, b) => bar.chords.map((_, chord) => ({ section, bar: b, chord }))));
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function shareLink(chart: ChordChart): string {
  return `${location.origin}${location.pathname}#/charts/import/${encodeChart(chart)}`;
}

export function ChartViewer({
  chart,
  settings,
  actions,
  onSaveKey,
}: {
  chart: ChordChart;
  settings: UserSettings;
  /** Extra buttons for the header (Edit, Save to my charts). */
  actions?: ReactNode;
  /** Keep the chart in the key showing now. Left out, the button is hidden. */
  onSaveKey?: (chart: ChordChart) => void;
}) {
  const savedKey = parseKey(chart.key) ?? C_MAJOR;
  const [shownKey, setShownKey] = useState(keyName(savedKey));
  const [view, setView] = useState<ChartView>(settings.noteNaming === 'sargam' ? 'sargam' : 'names');
  const [selected, setSelected] = useState<ChordRef | null>(null);
  const [copied, setCopied] = useState<'text' | 'link' | 'failed' | null>(null);
  const input = useNoteInput();

  useEffect(() => setShownKey(keyName(parseKey(chart.key) ?? C_MAJOR)), [chart.key]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const key = parseKey(shownKey) ?? savedKey;
  const shown = useMemo(() => transposeChart(chart, shownKey), [chart, shownKey]);
  const capo = useMemo(() => bestCapo(chartSymbols(shown), shownKey), [shown, shownKey]);
  const refs = useMemo(() => chordRefs(shown), [shown]);
  const moved = keyName(key) !== keyName(savedKey);

  /** The chord sounding at a position: "%" means the one before it carries on. */
  const soundingAt = useCallback(
    (ref: ChordRef) => {
      const at = refs.findIndex((r) => r.section === ref.section && r.bar === ref.bar && r.chord === ref.chord);
      for (let i = at; i >= 0; i--) {
        const r = refs[i]!;
        const symbol = shown.sections[r.section]?.bars[r.bar]?.chords[r.chord]?.symbol;
        if (symbol && symbol !== CARRY_ON) return renderChord(symbol, key);
      }
      return null;
    },
    [refs, shown, key],
  );
  const rendered = selected ? soundingAt(selected) : null;

  const select = useCallback(
    (ref: ChordRef) => {
      setSelected(ref);
      const r = soundingAt(ref);
      if (r && r.midi.length > 0) void playChord(r.midi);
    },
    [soundingAt],
  );

  const step = (dir: 1 | -1) => {
    const at = selected ? refs.findIndex((r) => r.section === selected.section && r.bar === selected.bar && r.chord === selected.chord) : -1;
    const next = refs[Math.min(refs.length - 1, Math.max(0, at + dir))];
    if (next) select(next);
  };

  // Marks on the keyboard: the chord's notes to play; green once you're holding exactly them.
  const marks = useMemo(() => {
    const m = new Map<number, KeyMark>();
    if (!rendered || rendered.midi.length === 0) return m;
    const want = new Set(rendered.midi.map(pitchClass));
    const held = new Set(input.held.map(pitchClass));
    const right = held.size > 0 && held.size === want.size && [...held].every((pc) => want.has(pc));
    for (const n of rendered.midi) m.set(n, right ? 'good' : 'target');
    return m;
  }, [rendered, input.held]);
  const holdingIt = rendered && marks.size > 0 && [...marks.values()].every((v) => v === 'good');

  const labelFor = useMemo(() => noteLabeller(key, view === 'sargam' ? 'sargam' : settings.noteNaming === 'sargam' ? 'sargam' : 'western'), [key, view, settings.noteNaming]);

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={`${s.pageHead} ${s.noPrint}`} variants={fadeUp}>
        <div className="ui-stack" style={{ gap: 'var(--space-2)' }}>
          <span className="ui-eyebrow">Band chart</span>
          <h1 className="ui-title" data-testid="chart-title">
            {chart.title}
          </h1>
          <div className={s.meta}>
            <Badge tone="accent" data-testid="chart-key">
              Key of {pretty(keyLabel(key))}
            </Badge>
            <Badge>{chart.timeSignature}</Badge>
            {chart.tempo && <Badge>{chart.tempo} BPM</Badge>}
            {moved && <span className="ui-muted">Written in {pretty(keyLabel(savedKey))}</span>}
          </div>
        </div>
        <div className={s.actions}>
          {actions}
          <Button variant="secondary" onClick={() => window.print()} data-testid="chart-print">
            Print or save PDF
          </Button>
          <Button
            variant="ghost"
            onClick={() => void copy(chartAsText(shown, key, view)).then((ok) => setCopied(ok ? 'text' : 'failed'))}
            data-testid="chart-copy-text"
          >
            Copy as text
          </Button>
          <Button variant="ghost" onClick={() => void copy(shareLink(shown)).then((ok) => setCopied(ok ? 'link' : 'failed'))} data-testid="chart-copy-link">
            Copy link
          </Button>
        </div>
      </motion.div>

      {copied && (
        <p className={`ui-muted ${s.noPrint}`} role="status" data-testid="chart-copied">
          {copied === 'text'
            ? 'Copied. Paste it into your band chat.'
            : copied === 'link'
              ? 'Link copied. It opens this chart in the app, in this key.'
              : "Couldn't copy. Your browser blocked the clipboard."}
        </p>
      )}

      <motion.div variants={fadeUp} className={s.noPrint}>
        <Card className={s.toolbar}>
          <div className={s.keyStepper}>
            <Button variant="secondary" size="md" onClick={() => setShownKey(keyName(shiftKey(key, -1)))} aria-label="Down a half step" data-testid="key-down">
              −
            </Button>
            <Select label="Key" value={keyName(key)} options={keyOptions(key.mode)} onChange={(e) => setShownKey(e.target.value)} data-testid="chart-key-select" />
            <Button variant="secondary" size="md" onClick={() => setShownKey(keyName(shiftKey(key, 1)))} aria-label="Up a half step" data-testid="key-up">
              +
            </Button>
            {moved && (
              <Button variant="ghost" size="md" onClick={() => setShownKey(keyName(savedKey))} data-testid="key-reset">
                Back to {pretty(keyName(savedKey))}
              </Button>
            )}
            {moved && onSaveKey && (
              <Button variant="primary" size="md" onClick={() => onSaveKey(shown)} data-testid="key-save">
                Keep this key
              </Button>
            )}
          </div>
          <div className="ui-field">
            <span className="ui-field-label">Show</span>
            <div data-testid="chart-view">
              <SegmentedControl label="Show" value={view} options={VIEW_OPTIONS} onChange={setView} />
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className={s.noPrint}>
        <Card className={s.capo} data-testid="capo-hint">
          <Badge tone="neutral">Guitar</Badge>
          {capo ? (
            <>
              <p>
                <strong>
                  Capo on fret {capo.fret}, play {pretty(keyName(capo.shapesKey))} shapes.
                </strong>{' '}
                <span className="ui-muted">The band still hears {pretty(keyName(key))}.</span>
              </p>
              <div className={s.shapes}>
                {capo.shapes.map((sh) => (
                  <span key={sh.sounds} className={s.shape} title={`Sounds as ${sh.sounds}`}>
                    {pretty(sh.play)} → {pretty(sh.sounds)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p>
              <strong>No capo needed.</strong> <span className="ui-muted">In {pretty(keyName(key))} these chords are already easy guitar shapes.</span>
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="lg" className={s.printArea}>
          <div className={s.printOnly}>
            <h1 className={s.printTitle}>{chart.title}</h1>
            <p className={s.printMeta}>
              Key of {pretty(keyLabel(key))} · {chart.timeSignature}
              {chart.tempo ? ` · ${chart.tempo} BPM` : ''}
              {capo ? ` · Guitar: capo ${capo.fret}, ${pretty(keyName(capo.shapesKey))} shapes` : ''}
            </p>
          </div>
          <ChartGrid chart={shown} keyOf={key} view={view} withSargam={settings.noteNaming === 'both'} selected={selected} onSelect={select} />
          <p className={`ui-muted ${s.legend} ${s.noPrint}`} style={{ marginTop: 'var(--space-4)' }}>
            Click a chord to hear it and see it on the keyboard. A <span style={{ color: 'var(--warn)' }}>*</span> marks a chord with notes from
            outside the key.
          </p>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className={s.noPrint}>
        <Card className={s.chordPanel} data-testid="chord-panel">
          <div className={s.chordInfo}>
            {rendered ? (
              <div>
                <Swap value={rendered.symbol}>
                  <span className={s.bigChord} data-testid="chord-panel-name">
                    {pretty(rendered.symbol)}
                  </span>
                </Swap>
                <p className="ui-muted">
                  {pretty(chordLongName(rendered.parsed))}. Roman {pretty(rendered.roman)}, number {pretty(rendered.nashville)}. Notes:{' '}
                  {rendered.notes.map(pretty).join(' ')}.
                  {holdingIt && <strong style={{ color: 'var(--good)' }}> That's it!</strong>}
                </p>
              </div>
            ) : (
              <p className="ui-muted">Pick a chord on the chart, or press Next to step through the song one chord at a time.</p>
            )}
            <div className={s.actions}>
              <Button variant="ghost" size="sm" onClick={() => step(-1)} disabled={refs.length === 0} data-testid="chord-prev">
                ◀ Previous
              </Button>
              <Button variant="secondary" size="sm" onClick={() => rendered && void playChord(rendered.midi)} disabled={!rendered} data-testid="chord-hear">
                ▶ Hear it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => step(1)} disabled={refs.length === 0} data-testid="chord-next">
                Next ▶
              </Button>
            </div>
          </div>
          <LiveKeyboard size={settings.keyboardSize as KeyboardSize} labelFor={labelFor} marks={marks} />
        </Card>
      </motion.div>
    </motion.div>
  );
}

