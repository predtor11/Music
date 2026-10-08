/**
 * The weekly progress report: headline numbers, accuracy per topic, practice
 * habit, repeat mistakes, speed, and what to practise next.
 */

import type { ProgressReport } from '@music/contracts';
import { Badge, Button, Card, DayStrip, Meter, Ring, Sparkline, StatTile, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { href } from '../router.js';
import {
  accuracyTone,
  formatMinutes,
  formatTime,
  overallAccuracy,
  percent,
  rangeLabel,
  skillLabel,
  speedChange,
  suggestionLink,
  topicSummaries,
  weekDays,
  type Day,
  type TopicSummary,
} from './format.js';
import s from './progress.module.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Habit({ days, practised, streak }: { days: Day[]; practised: Set<string>; streak: number }) {
  const count = days.filter((d) => practised.has(d.date)).length;
  return (
    <Card padding="lg" className={s.section} data-testid="habit">
      <div className={s.sectionHead}>
        <h2 className="ui-heading">Practice habit</h2>
        <Badge tone={streak > 0 ? 'accent' : 'neutral'} data-testid="streak-badge">
          {streak > 0 ? `${plural(streak, 'day')} in a row` : 'No streak yet'}
        </Badge>
      </div>
      <DayStrip
        days={days.map((d, i) => ({
          label: d.short.slice(0, 2),
          active: practised.has(d.date),
          today: i === days.length - 1,
          title: `${d.long}: ${practised.has(d.date) ? 'practised' : 'no practice'}`,
        }))}
      />
      <p className={`ui-muted ${s.small}`}>
        {count === 0 ? 'No practice days this week.' : `You practised on ${plural(count, 'day')} of the last 7.`} Short, regular practice beats one long session.
      </p>
    </Card>
  );
}

function TopicRow({ t, days }: { t: TopicSummary; days: Day[] }) {
  const tone = accuracyTone(t.accuracy);
  return (
    <motion.li variants={fadeUp} className={s.topic} data-testid={`topic-${t.topic}`}>
      <div className={s.topicName}>
        <span className={s.strong}>{t.label}</span>
        <span className={`ui-muted ${s.small}`}>{plural(t.attempts, 'answer')}</span>
      </div>
      <Sparkline
        points={t.points}
        slots={days.length}
        label={`${t.label}: right first time each day`}
        edges={[days[0]!.short, days.at(-1)!.short]}
      />
      <div className={s.topicScore}>
        <span className={s.bigNum} data-testid="topic-accuracy">
          {percent(t.accuracy)}
        </span>
        {t.change !== null && Math.round(t.change * 100) !== 0 ? (
          <Badge tone={t.change > 0 ? 'good' : 'warn'}>
            {t.change > 0 ? '▲' : '▼'} {Math.abs(Math.round(t.change * 100))} pts
          </Badge>
        ) : (
          <Badge tone={tone}>{tone === 'good' ? 'Solid' : tone === 'warn' ? 'Getting there' : 'Needs work'}</Badge>
        )}
      </div>
    </motion.li>
  );
}

function Topics({ topics, days }: { topics: TopicSummary[]; days: Day[] }) {
  return (
    <Card padding="lg" className={s.section} data-testid="topics">
      <div className={s.sectionHead}>
        <div>
          <h2 className="ui-heading">Right first time, by topic</h2>
          <p className={`ui-muted ${s.small}`}>Each dot is one day. Higher is better. Hover a dot for the numbers.</p>
        </div>
      </div>
      <motion.ul className={s.topicList} variants={stagger(0.06)}>
        {topics.map((t) => (
          <TopicRow key={t.topic} t={t} days={days} />
        ))}
      </motion.ul>
      <details className={s.table}>
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Topic</th>
              {days.map((d) => (
                <th key={d.date} scope="col">
                  {d.short}
                </th>
              ))}
              <th scope="col">Week</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.topic}>
                <th scope="row">{t.label}</th>
                {days.map((_, i) => {
                  const p = t.points.find((x) => x.slot === i);
                  return <td key={i}>{p ? percent(p.value) : '–'}</td>;
                })}
                <td>{percent(t.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

function Mistakes({ patterns }: { patterns: ProgressReport['patterns'] }) {
  const max = Math.max(1, ...patterns.map((p) => p.occurrences));
  return (
    <Card padding="lg" className={s.section} data-testid="mistakes">
      <h2 className="ui-heading">Repeat mistakes</h2>
      {patterns.length === 0 ? (
        <p className="ui-muted" data-testid="no-mistakes">
          No mistake keeps coming back this week. Nice and clean.
        </p>
      ) : (
        <motion.ul className={s.list} variants={stagger(0.06)}>
          {patterns.map((p) => (
            <motion.li key={p.id} variants={fadeUp} className={s.mistake} data-testid={`mistake-${p.id}`}>
              <div className={s.rowHead}>
                <span className={s.strong}>{p.description}</span>
                <span className={`ui-muted ${s.small}`}>{plural(p.occurrences, 'time')}</span>
              </div>
              <Meter value={p.occurrences} max={max} tone="warn" label={`${p.description}: ${plural(p.occurrences, 'time')}`} />
              {p.skills.length > 0 && (
                <div className={s.chips}>
                  {p.skills.map((k) => (
                    <Badge key={k} tone="neutral">
                      {skillLabel(k)}
                    </Badge>
                  ))}
                </div>
              )}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Card>
  );
}

function Speed({ speed }: { speed: ProgressReport['speed'] }) {
  const shown = speed.slice(0, 6);
  return (
    <Card padding="lg" className={s.section} data-testid="speed">
      <div>
        <h2 className="ui-heading">Speed</h2>
        <p className={`ui-muted ${s.small}`}>Typical time to a right answer, against last week.</p>
      </div>
      {shown.length === 0 ? (
        <p className="ui-muted">No right answers to time yet this week.</p>
      ) : (
        <motion.ul className={s.list} variants={stagger(0.05)}>
          {shown.map((x) => {
            const c = speedChange(x.changePercent);
            return (
              <motion.li key={x.skill} variants={fadeUp} className={s.speedRow} data-testid={`speed-${x.skill}`}>
                <span className={s.strong}>{skillLabel(x.skill)}</span>
                <span className={s.time}>{formatTime(x.medianTimeMs)}</span>
                <Badge tone={c.tone}>{c.text}</Badge>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </Card>
  );
}

export function Suggestions({ suggestions, title = 'What to practise next' }: { suggestions: ProgressReport['suggestions']; title?: string }) {
  if (suggestions.length === 0) return null;
  return (
    <Card highlight padding="lg" className={s.section} data-testid="suggestions">
      <h2 className="ui-heading">{title}</h2>
      <motion.ol className={s.suggestions} variants={stagger(0.08)}>
        {suggestions.map((x, i) => {
          const link = suggestionLink(x);
          return (
            <motion.li key={i} variants={fadeUp} className={s.suggestion} data-testid={`suggestion-${i}`}>
              <span className={s.suggestionNum} aria-hidden>
                {i + 1}
              </span>
              <p className={s.suggestionText}>{x.text}</p>
              <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => (location.hash = link.href)} data-testid={`suggestion-${i}-go`}>
                {link.action}
              </Button>
            </motion.li>
          );
        })}
      </motion.ol>
    </Card>
  );
}

function Header({ days, children }: { days: Day[]; children?: ReactNode }) {
  return (
    <motion.div variants={fadeUp} className={s.intro}>
      <span className="ui-eyebrow" data-testid="range">
        This week · {rangeLabel(days)}
      </span>
      <h1 className="ui-title">Your progress</h1>
      {children}
    </motion.div>
  );
}

export function EmptyReport({ report, tzOffset }: { report: ProgressReport; tzOffset: number }) {
  const days = weekDays(report, tzOffset);
  return (
    <motion.div className={s.page} variants={stagger(0.08)} initial="hidden" animate="show" data-testid="page-progress">
      <Header days={days} />
      <motion.div variants={fadeUp}>
        <Card highlight padding="lg" className={s.empty} data-testid="progress-empty">
          <div className={s.emptyArt} aria-hidden>
            <Ring value={0} size={112} thickness={10} label="">
              <span className={s.emptyNote}>♪</span>
            </Ring>
          </div>
          <div className={s.emptyText}>
            <h2 className="ui-heading">Your report starts with your first lesson</h2>
            <p className="ui-muted">
              Play through a lesson or two and this page fills in: how often you get things right first time, the mistakes that keep coming back, how
              quickly you answer, and your practice streak. Everything is about you, at your pace.
            </p>
            <div className={s.emptyActions}>
              <Button variant="primary" onClick={() => (location.hash = href.lessons)} data-testid="empty-start">
                Start a lesson
              </Button>
              <Button variant="ghost" onClick={() => (location.hash = href.chords)}>
                Free play
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
      <motion.div variants={fadeUp}>
        <Habit days={days} practised={new Set()} streak={report.practice.streakDays} />
      </motion.div>
    </motion.div>
  );
}

export function Report({ report, tzOffset }: { report: ProgressReport; tzOffset: number }) {
  const days = weekDays(report, tzOffset);
  const topics = topicSummaries(report, days);
  const practised = new Set(report.accuracyTrend.map((r) => r.date));
  const overall = overallAccuracy(report);
  const answers = report.accuracyTrend.reduce((n, r) => n + r.attempts, 0);
  const { minutes, sessions, streakDays } = report.practice;

  return (
    <motion.div className={s.page} variants={stagger(0.08)} initial="hidden" animate="show" data-testid="page-progress">
      <Header days={days}>
        <p className="ui-muted">
          {plural(answers, 'answer')} across {plural(topics.length, 'topic')} this week.
          {overall !== null && overall >= 0.8 ? ' You are getting most things right first time.' : ' Every mistake here is something to learn from.'}
        </p>
      </Header>

      <motion.div className={s.stats} variants={stagger(0.06)}>
        <StatTile
          label="Right first time"
          value={overall === null ? '–' : percent(overall)}
          hint={plural(answers, 'answer')}
          aside={overall !== null && <Ring value={overall} tone={accuracyTone(overall)} size={64} thickness={7} label={`${percent(overall)} right first time`} />}
          data-testid="stat-accuracy"
        />
        <StatTile label="Practice" value={formatMinutes(minutes)} unit="min" hint={plural(sessions, 'session')} data-testid="stat-minutes" />
        <StatTile
          label="Streak"
          value={streakDays}
          unit={streakDays === 1 ? 'day' : 'days'}
          hint={streakDays > 0 ? 'Keep it going today' : 'Practise today to start one'}
          data-testid="stat-streak"
        />
        <StatTile label="Topics" value={topics.length} hint={topics[0] ? `Most: ${topics[0].label}` : undefined} data-testid="stat-topics" />
      </motion.div>

      <div className={s.grid}>
        <motion.div variants={fadeUp} className={s.main}>
          <Topics topics={topics} days={days} />
          <Mistakes patterns={report.patterns} />
        </motion.div>
        <motion.div variants={fadeUp} className={s.side}>
          <Suggestions suggestions={report.suggestions} />
          <Habit days={days} practised={practised} streak={streakDays} />
          <Speed speed={report.speed} />
        </motion.div>
      </div>
    </motion.div>
  );
}
