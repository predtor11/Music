/**
 * A chord chart drawn the way bands read it: each section with its name, and
 * four bars to a row. Click a chord to hear it and see it on the keyboard.
 */

import type { ChartView, ChordChart } from '@music/contracts';
import { CARRY_ON, beatsPerBar, renderChord } from '@music/charts';
import { type Key } from '@music/theory';
import { Badge, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { Sargam } from '../chord/NoteName.js';
import { chordText } from './display.js';
import s from './charts.module.css';

export interface ChordRef {
  section: number;
  bar: number;
  chord: number;
}

const sameRef = (a: ChordRef | null, b: ChordRef) => !!a && a.section === b.section && a.bar === b.bar && a.chord === b.chord;

/** Colour family per kind of section. */
const TONE: Record<string, string> = { verse: 'verse', chorus: 'chorus', 'pre-chorus': 'pre', bridge: 'bridge', solo: 'solo', interlude: 'solo' };

export function ChartGrid({
  chart,
  keyOf,
  view,
  withSargam = false,
  selected,
  onSelect,
}: {
  chart: ChordChart;
  keyOf: Key;
  view: ChartView;
  /** Show the styled sargam line under chord names. */
  withSargam?: boolean;
  selected: ChordRef | null;
  onSelect?: (ref: ChordRef) => void;
}) {
  const perBar = beatsPerBar(chart.timeSignature);
  return (
    <motion.div className={s.grid} variants={stagger(0.05)} initial="hidden" animate="show" data-testid="chart-grid">
      {chart.sections.map((section, si) => (
        <motion.section key={si} className={s.section} variants={fadeUp} data-tone={TONE[section.kind] ?? 'other'} data-testid="chart-section">
          <header className={s.sectionHead}>
            <h3 className={s.sectionName}>{section.name}</h3>
            {(section.repeat ?? 1) > 1 && (
              <Badge tone="accent" title={`Play this ${section.repeat} times`}>
                x{section.repeat}
              </Badge>
            )}
          </header>
          <div className={s.bars}>
            {section.bars.map((bar, bi) => {
              return (
                <div key={bi} className={s.bar} data-testid="chart-bar">
                  {bar.chords.map((c, ci) => {
                    const ref = { section: si, bar: bi, chord: ci };
                    if (c.symbol === CARRY_ON) {
                      return (
                        <button
                          key={ci}
                          type="button"
                          className={`${s.chord} ${s.carry}`}
                          style={{ flexGrow: c.beats ?? 1 }}
                          data-selected={sameRef(selected, ref)}
                          onClick={() => onSelect?.(ref)}
                          title="The chord before carries on"
                          aria-label="The chord before carries on"
                          data-testid="chart-chord"
                        >
                          <span className={s.simile}>%</span>
                        </button>
                      );
                    }
                    const r = renderChord(c.symbol, keyOf);
                    const text = r ? chordText(r, view, withSargam) : { main: c.symbol, sub: null, sargam: null };
                    return (
                      <button
                        key={ci}
                        type="button"
                        className={s.chord}
                        style={{ flexGrow: c.beats ?? 1 }}
                        data-selected={sameRef(selected, ref)}
                        data-outside={r ? !r.fn.inKey : undefined}
                        onClick={() => onSelect?.(ref)}
                        title={r ? `${r.symbol} · ${r.roman} · ${r.notes.join(' ')}` : c.symbol}
                        data-testid="chart-chord"
                      >
                        <span className={s.chordMain}>{text.main}</span>
                        {text.sub && <span className={s.chordSub}>{text.sub}</span>}
                        {text.sargam && (
                          <span className={s.chordSargam}>
                            {text.sargam.map((n, i) => (
                              <span key={i}>
                                {i > 0 && '/'}
                                <Sargam name={n} />
                              </span>
                            ))}
                          </span>
                        )}
                        {bar.chords.length > 1 && c.beats !== undefined && c.beats !== perBar / bar.chords.length && (
                          <span className={s.beats} aria-label={`${c.beats} beats`}>
                            {'·'.repeat(Math.round(c.beats))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </motion.section>
      ))}
    </motion.div>
  );
}
