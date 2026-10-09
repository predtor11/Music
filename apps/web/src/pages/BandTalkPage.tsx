/**
 * Band talk: a searchable cheat sheet of what musicians say at rehearsal.
 * Each phrase has its meaning, why it matters, how you'd hear it said, and an
 * example that plays and lights up on the keyboard. Phrases the course
 * glossary already teaches show the glossary's own entry.
 */

import type { BandTalkTerm, GlossaryTerm, UserSettings } from '@music/contracts';
import { C_MAJOR, parseKey, pretty, type MidiNote } from '@music/theory';
import { Badge, Button, Card, SegmentedControl, fadeUp, stagger } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getBandTalk, getGlossary } from '../api/client.js';
import { playChord } from '../audio/sound.js';
import { CATEGORY_LABELS, exampleSteps, searchText } from '../bandtalk/example.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../bandtalk/bandtalk.module.css';

type Filter = 'all' | BandTalkTerm['category'];
const FILTERS: Array<{ value: Filter; label: string }> = [{ value: 'all', label: 'All' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as Filter, label }))];

export function BandTalkPage({ id, settings }: { id: string | null; settings: UserSettings }) {
  const [terms, setTerms] = useState<BandTalkTerm[] | null>(null);
  const [glossary, setGlossary] = useState<Map<string, GlossaryTerm>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(id);

  useEffect(() => {
    let live = true;
    Promise.all([getBandTalk(), getGlossary()])
      .then(([list, gloss]) => {
        if (!live) return;
        setTerms(list);
        setGlossary(new Map(gloss.map((t) => [t.id, t])));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (terms ?? []).filter((t) => (filter === 'all' || t.category === filter) && (!q || searchText(t, glossary.get(t.glossaryId ?? '')?.meaning).includes(q)));
  }, [terms, query, filter, glossary]);

  if (error) return <LoadError what="the band-talk cheat sheet" message={error} />;
  if (!terms) return <Loading />;

  const current = terms.find((t) => t.id === selected) ?? shown[0] ?? terms[0]!;
  const choose = (termId: string) => {
    setSelected(termId);
    // Keep the address shareable without a hash change, which would scroll to the top.
    history.replaceState(null, '', href.bandtalk(termId));
  };

  return (
    <motion.div className={s.page} variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <span className="ui-eyebrow">Band talk</span>
        <h1 className="ui-title">What the band means</h1>
        <p className={`ui-muted ${s.lead}`}>
          The words musicians throw around at rehearsal, in plain English. Each one has an example you can hear and see on the keyboard.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className={s.tools}>
        <input
          type="search"
          className={s.search}
          placeholder="Search: bridge, two-five-one, capo…"
          aria-label="Search band talk"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="bandtalk-search"
        />
        <div data-testid="bandtalk-filter">
          <SegmentedControl label="Show" value={filter} options={FILTERS} onChange={setFilter} />
        </div>
      </motion.div>

      <div className={s.layout}>
        <motion.ul variants={stagger(0.02)} className={s.list} aria-label="Phrases">
          {shown.length === 0 && (
            <li className={`ui-muted ${s.empty}`} data-testid="bandtalk-empty">
              Nothing matches “{query}”. Try fewer words.
            </li>
          )}
          {shown.map((t) => (
            <motion.li key={t.id} variants={fadeUp} layout="position">
              <button type="button" className={s.row} data-on={t.id === current.id || undefined} onClick={() => choose(t.id)} data-testid={`bandtalk-${t.id}`}>
                <span className={s.rowPhrase}>{t.phrase}</span>
                <span className={`ui-muted ${s.rowMeaning}`}>{t.meaning ?? glossary.get(t.glossaryId ?? '')?.meaning ?? ''}</span>
              </button>
            </motion.li>
          ))}
        </motion.ul>

        <AnimatePresence mode="wait">
          <motion.div key={current.id} className={s.detailWrap} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <Detail term={current} glossary={glossary} settings={settings} />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Detail({ term, glossary, settings }: { term: BandTalkTerm; glossary: Map<string, GlossaryTerm>; settings: UserSettings }) {
  const linked = term.glossaryId ? glossary.get(term.glossaryId) : undefined;
  const steps = useMemo(() => exampleSteps(term), [term]);
  const key = useMemo(() => parseKey(term.example.key) ?? C_MAJOR, [term]);
  const labelFor = useMemo(() => noteLabeller(key, settings.noteNaming), [key, settings.noteNaming]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
  };
  useEffect(() => stop, []);

  const play = () => {
    stop();
    setPlaying(true);
    const beat = 60 / term.example.bpm;
    let t = 0;
    steps.forEach((st, i) => {
      timers.current.push(
        setTimeout(() => {
          setAt(i);
          void playChord(st.notes, st.beats * beat + 0.15);
        }, t * 1000),
      );
      t += st.beats * beat;
    });
    timers.current.push(setTimeout(() => setPlaying(false), t * 1000));
  };

  const step = steps[at] ?? steps[0];
  const marks = useMemo(() => new Map<MidiNote, KeyMark>((step?.notes ?? []).map((n) => [n, 'target'])), [step]);
  const related = term.related.map((rid) => glossary.get(rid)).filter((g): g is GlossaryTerm => !!g);
  const openTerm = open ? glossary.get(open) : undefined;

  return (
    <Card padding="lg" className={s.detail} data-testid="bandtalk-detail">
      <div className={s.detailHead}>
        <div>
          <h2 className={`ui-title ${s.phrase}`} data-testid="bandtalk-phrase">
            {term.phrase}
          </h2>
          {term.aliases.length > 0 && <p className={`ui-muted ${s.aliases}`}>Also: {term.aliases.join(', ')}</p>}
        </div>
        <Badge tone="neutral">{CATEGORY_LABELS[term.category]}</Badge>
      </div>

      {linked ? (
        <div className={s.meaning} data-testid="bandtalk-glossary">
          <p>
            <strong>{pretty(linked.term)}</strong>: {linked.meaning}
          </p>
          <p>
            <strong>Why it matters:</strong> {linked.whyItMatters}
          </p>
          <p className={`ui-muted ${s.small}`}>
            From the glossary. It's taught in{' '}
            <a href={href.lesson(linked.lessonId)} data-testid="bandtalk-lesson">
              lesson {linked.lessonId.replace(/^u(\d+)-l(\d+)$/, '$1.$2')}
            </a>
            .
          </p>
        </div>
      ) : (
        <div className={s.meaning}>
          <p data-testid="bandtalk-meaning">{term.meaning}</p>
          <p>
            <strong>Why it matters:</strong> {term.whyItMatters}
          </p>
        </div>
      )}

      <blockquote className={s.quote}>
        <span className="ui-eyebrow">How you'll hear it</span>
        <span data-testid="bandtalk-say">“{term.sayIt}”</span>
      </blockquote>

      <div className={s.example}>
        <div className={s.exampleHead}>
          <p className={s.caption}>{term.example.caption}</p>
          <div className={s.actions}>
            <Button size="sm" variant="primary" onClick={playing ? stop : play} data-testid="bandtalk-play">
              {playing ? '■ Stop' : '▶ Hear it'}
            </Button>
            {term.jam && (
              <Button size="sm" variant="secondary" onClick={() => (location.hash = href.jam(term.jam))} data-testid="bandtalk-jam">
                Try it with the band
              </Button>
            )}
          </div>
        </div>
        <div className={s.steps}>
          {steps.map((st, i) => (
            <button
              key={i}
              type="button"
              className={s.step}
              data-on={i === at || undefined}
              onClick={() => {
                stop();
                setAt(i);
                void playChord(st.notes, 1.2);
              }}
              data-testid={`bandtalk-step-${i}`}
            >
              {pretty(st.label)}
            </button>
          ))}
        </div>
        <LiveKeyboard size={settings.keyboardSize as KeyboardSize} labelFor={labelFor} marks={marks} focusNote={step?.notes[0] ?? 60} />
      </div>

      {related.length > 0 && (
        <div className={s.related}>
          <span className="ui-eyebrow">Words to know with it</span>
          <div className={s.chips}>
            {related.map((g) => (
              <button key={g.id} type="button" className={s.chip} data-on={open === g.id || undefined} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)} data-testid={`related-${g.id}`}>
                {pretty(g.term)}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {openTerm && (
              <motion.div key={openTerm.id} className={s.relatedBody} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} data-testid="related-body">
                <p>
                  <strong>{pretty(openTerm.term)}</strong>: {openTerm.meaning}
                </p>
                <p className="ui-muted">{openTerm.whyItMatters}</p>
                <Button size="sm" variant="ghost" onClick={() => void playChord(openTerm.exampleMidi, 1.4)}>
                  ▶ Hear the example
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}
