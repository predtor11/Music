/**
 * Write or change a chart: title, key, time and tempo, then each section's
 * chords typed as bars ("| G | D/F# | Em C |"), with a live preview.
 */

import { ChordChartSchema, type ChordChart, type UserSettings } from '@music/contracts';
import { formatBars, newId, parseBars, sectionKindFor } from '@music/charts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, parseKey, pretty } from '@music/theory';
import { Button, Card, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { ChartGrid } from '../charts/ChartGrid.js';
import { deleteChart, getChart, saveChart } from '../charts/store.js';
import { href } from '../router.js';
import s from '../charts/charts.module.css';

const KEY_GROUPS = (['major', 'minor'] as const).map((mode) => ({
  label: mode === 'major' ? 'Major keys' : 'Minor keys',
  options: COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) })),
}));

const TIME_OPTIONS = ['4/4', '3/4', '6/8', '2/4', '12/8'].map((t) => ({ value: t, label: t }));

const SECTION_NAMES = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Outro'];

interface DraftSection {
  id: string;
  name: string;
  repeat: number;
  text: string;
}

interface Draft {
  id: string;
  title: string;
  key: string;
  time: string;
  bpm: string;
  sections: DraftSection[];
}

function toDraft(chart: ChordChart | null): Draft {
  if (!chart) {
    return {
      id: newId(),
      title: '',
      key: 'C',
      time: '4/4',
      bpm: '',
      sections: [
        { id: newId('s'), name: 'Verse', repeat: 1, text: '' },
        { id: newId('s'), name: 'Chorus', repeat: 1, text: '' },
      ],
    };
  }
  const key = parseKey(chart.key) ?? C_MAJOR;
  return {
    id: chart.id,
    title: chart.title,
    key: keyName(key),
    time: chart.timeSignature,
    bpm: chart.tempo ? String(chart.tempo) : '',
    sections: chart.sections.map((sec) => ({ id: sec.id, name: sec.name, repeat: sec.repeat ?? 1, text: formatBars(sec.bars) })),
  };
}

/** The draft as a chart, plus what's stopping it from saving. */
function build(draft: Draft, base: ChordChart | null): { chart: ChordChart | null; problems: Map<string, string>; general: string[] } {
  const key = parseKey(draft.key) ?? C_MAJOR;
  const problems = new Map<string, string>();
  const general: string[] = [];
  const sections = draft.sections.map((d) => {
    const { bars, unknown } = parseBars(d.text);
    if (unknown.length > 0) problems.set(d.id, `Can't read ${unknown.map((u) => `"${u}"`).join(', ')}. Write chords like G, Em, D/F#, Am7, Cmaj7, Bb. A % carries on the chord before, so it can't open a section.`);
    else if (bars.length === 0) problems.set(d.id, 'Add at least one bar, for example | G | D | Em | C |');
    const name = d.name.trim() || 'Section';
    return { id: d.id, name, kind: sectionKindFor(name), bars, ...(d.repeat > 1 ? { repeat: d.repeat } : {}) };
  });
  if (!draft.title.trim()) general.push('Give the song a title.');
  if (sections.length === 0) general.push('Add at least one section.');
  const bpm = draft.bpm.trim() ? Number(draft.bpm) : undefined;
  if (bpm !== undefined && !(bpm >= 20 && bpm <= 300)) general.push('Tempo should be between 20 and 300 BPM.');
  const candidate: ChordChart = {
    ...(base ?? { source: { kind: 'manual' as const } }),
    version: 1,
    id: draft.id,
    title: draft.title.trim() || 'Untitled song',
    key: keyName(key),
    timeSignature: draft.time,
    tempo: bpm !== undefined && Number.isFinite(bpm) ? bpm : undefined,
    sections: sections.filter((sec) => sec.bars.length > 0),
    updatedAt: new Date().toISOString(),
  };
  if (candidate.tempo === undefined) delete candidate.tempo;
  const parsed = ChordChartSchema.safeParse(candidate);
  return { chart: parsed.success ? parsed.data : null, problems, general };
}

export function ChartEditPage({ id, settings }: { id: string | null; settings: UserSettings }) {
  const existing = useMemo(() => (id ? getChart(id) : null), [id]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(existing));
  const [tried, setTried] = useState(false);
  const result = useMemo(() => build(draft, existing), [draft, existing]);
  const key = parseKey(draft.key) ?? C_MAJOR;
  const canSave = result.chart !== null && result.problems.size === 0 && result.general.length === 0;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setSection = (sid: string, patch: Partial<DraftSection>) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((sec) => (sec.id === sid ? { ...sec, ...patch } : sec)) }));
  const move = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.sections];
      const to = index + dir;
      if (to < 0 || to >= list.length) return d;
      [list[index], list[to]] = [list[to]!, list[index]!];
      return { ...d, sections: list };
    });
  const addSection = () => {
    const used = new Set(draft.sections.map((sec) => sec.name));
    const name = SECTION_NAMES.find((n) => !used.has(n)) ?? 'Verse';
    set({ sections: [...draft.sections, { id: newId('s'), name, repeat: 1, text: '' }] });
  };

  const save = () => {
    setTried(true);
    if (!canSave || !result.chart) return;
    saveChart(result.chart);
    location.hash = href.chart(result.chart.id);
  };

  const remove = () => {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.title}"? This can't be undone.`)) return;
    deleteChart(existing.id);
    location.hash = href.charts;
  };

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={s.pageHead} variants={fadeUp}>
        <div className="ui-stack" style={{ gap: 'var(--space-2)' }}>
          <span className="ui-eyebrow">{existing ? 'Edit chart' : 'New chart'}</span>
          <h1 className="ui-title">{draft.title.trim() || 'Untitled song'}</h1>
        </div>
        <div className={s.actions}>
          {existing && (
            <Button variant="danger" onClick={remove} data-testid="chart-delete">
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => (location.hash = existing ? href.chart(existing.id) : href.charts)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} data-testid="chart-save">
            Save chart
          </Button>
        </div>
      </motion.div>

      <div className={s.editor}>
        <motion.div className={s.form} variants={fadeUp}>
          <Card className={s.form}>
            <div className={s.fields}>
              <label className={`ui-field ${s.titleInput}`}>
                <span className="ui-field-label">Song title</span>
                <input
                  className={s.input}
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="What the band calls it"
                  maxLength={120}
                  data-testid="chart-title-input"
                />
              </label>
            </div>
            <div className={s.fields}>
              <Select label="Key the chords are in" value={draft.key} groups={KEY_GROUPS} onChange={(e) => set({ key: e.target.value })} data-testid="chart-key-input" />
              <Select label="Time" value={draft.time} options={TIME_OPTIONS} onChange={(e) => set({ time: e.target.value })} data-testid="chart-time-input" />
              <label className={`ui-field ${s.small}`}>
                <span className="ui-field-label">BPM</span>
                <input
                  className={s.input}
                  inputMode="numeric"
                  value={draft.bpm}
                  onChange={(e) => set({ bpm: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="96"
                  data-testid="chart-bpm-input"
                />
              </label>
            </div>
            <p className={`ui-muted ${s.help}`}>
              Type each section's chords between bar lines: <code>| G | D/F# | Em | C |</code>. Two chords in a bar share it: <code>| Em C |</code>. A dot
              holds a chord one more beat: <code>| G . . D |</code> is three beats of G and one of D. <code>%</code> means the chord before carries on.
            </p>
          </Card>

          {draft.sections.map((sec, i) => {
            const problem = result.problems.get(sec.id);
            return (
              <Card key={sec.id} className={s.sectionEdit} data-testid="section-edit">
                <div className={s.sectionEditHead}>
                  <label className={`ui-field ${s.titleInput}`}>
                    <span className="ui-field-label">Section</span>
                    <input
                      className={s.input}
                      value={sec.name}
                      list="chart-section-names"
                      onChange={(e) => setSection(sec.id, { name: e.target.value })}
                      maxLength={40}
                      data-testid="section-name"
                    />
                  </label>
                  <Select
                    label="Times"
                    value={String(sec.repeat)}
                    options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? 'Once' : `x${n}` }))}
                    onChange={(e) => setSection(sec.id, { repeat: Number(e.target.value) })}
                  />
                  <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${sec.name} up`}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === draft.sections.length - 1} aria-label={`Move ${sec.name} down`}>
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set({ sections: draft.sections.filter((x) => x.id !== sec.id) })}
                    aria-label={`Remove ${sec.name}`}
                  >
                    Remove
                  </Button>
                </div>
                <textarea
                  className={s.textarea}
                  value={sec.text}
                  onChange={(e) => setSection(sec.id, { text: e.target.value })}
                  placeholder="| G | D | Em | C |"
                  spellCheck={false}
                  rows={Math.max(2, sec.text.split('\n').length)}
                  aria-label={`${sec.name} chords`}
                  data-testid="section-text"
                />
                {problem && (tried || sec.text.trim()) && (
                  <p className={s.problem} role="alert" data-testid="section-problem">
                    {problem}
                  </p>
                )}
              </Card>
            );
          })}
          <datalist id="chart-section-names">
            {SECTION_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className={s.actions}>
            <Button variant="secondary" onClick={addSection} data-testid="section-add">
              + Add section
            </Button>
          </div>
          {tried && result.general.length > 0 && (
            <p className={s.problem} role="alert">
              {result.general.join(' ')}
            </p>
          )}
        </motion.div>

        <motion.div className={s.preview} variants={fadeUp}>
          <Card padding="lg">
            <span className="ui-eyebrow">Preview in {pretty(keyLabel(key))}</span>
            <div style={{ marginTop: 'var(--space-3)' }}>
              {result.chart && result.chart.sections.length > 0 ? (
                <ChartGrid chart={result.chart} keyOf={key} view={settings.noteNaming === 'sargam' ? 'sargam' : 'names'} withSargam={settings.noteNaming === 'both'} selected={null} />
              ) : (
                <p className="ui-muted">Your chart shows up here as you type.</p>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
