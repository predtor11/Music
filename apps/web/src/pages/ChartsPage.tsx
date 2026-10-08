/**
 * Band charts: your saved charts, a new one, or the example, plus the words
 * you'll see on a chart.
 */

import { chartSymbols, exampleChart } from '@music/charts';
import { keyLabel, parseKey, pretty } from '@music/theory';
import { Badge, Button, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { CHART_WORDS } from '../charts/words.js';
import { importChart, useSavedCharts } from '../charts/store.js';
import { href } from '../router.js';
import s from '../charts/charts.module.css';

export function ChartsPage() {
  const charts = useSavedCharts();

  const openExample = () => {
    location.hash = href.chart(importChart(exampleChart()));
  };

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={s.pageHead} variants={fadeUp}>
        <div className="ui-stack" style={{ gap: 'var(--space-2)' }}>
          <span className="ui-eyebrow">Play with a band</span>
          <h1 className="ui-title">Band charts</h1>
          <p className="ui-muted" style={{ margin: 0, maxWidth: 640 }}>
            A chord chart is the page a band reads: the song's sections, bar by bar, with the chords to play. Change key in one tap, flip between chord
            names and numbers, and print it or send it to the band.
          </p>
        </div>
        <div className={s.actions}>
          <Button variant="ghost" onClick={openExample} data-testid="charts-example">
            Open the example
          </Button>
          <Button variant="primary" onClick={() => (location.hash = href.chartNew)} data-testid="charts-new">
            New chart
          </Button>
        </div>
      </motion.div>

      {charts.length === 0 ? (
        <motion.div variants={fadeUp}>
          <Card padding="lg" className={s.empty} data-testid="charts-empty">
            <h2 className="ui-heading" style={{ margin: 0 }}>
              No charts yet
            </h2>
            <p className="ui-muted" style={{ margin: 0 }}>
              Type the chords of a song your band plays, or open the example to see how a chart works.
            </p>
          </Card>
        </motion.div>
      ) : (
        <motion.div className={s.list} variants={fadeUp} data-testid="charts-list">
          {charts.map(({ chart }) => {
            const key = parseKey(chart.key);
            return (
              <a key={chart.id} href={href.chart(chart.id)} className={s.listCard} data-testid="charts-item">
                <Card interactive className={s.listCard}>
                  <h2 className={s.listTitle}>{chart.title}</h2>
                  <div className={s.meta}>
                    <Badge tone="accent">{key ? pretty(keyLabel(key)) : chart.key}</Badge>
                    <Badge>{chart.sections.length === 1 ? '1 section' : `${chart.sections.length} sections`}</Badge>
                  </div>
                  <span className={s.listChords}>{[...new Set(chartSymbols(chart))].slice(0, 8).map(pretty).join('  ')}</span>
                </Card>
              </a>
            );
          })}
        </motion.div>
      )}

      <motion.div variants={fadeUp}>
        <Card padding="lg">
          <details>
            <summary className="ui-heading" style={{ cursor: 'pointer' }} data-testid="chart-words-toggle">
              Words you'll see on a chart
            </summary>
            <div className={s.words} style={{ marginTop: 'var(--space-4)' }} data-testid="chart-words">
              {CHART_WORDS.map((w) => (
                <div key={w.term} className={s.word}>
                  <h4>{w.term}</h4>
                  <p>{w.meaning}</p>
                  <p className="ui-muted">
                    <strong>Why it matters:</strong> {w.whyItMatters}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </Card>
      </motion.div>
    </motion.div>
  );
}
