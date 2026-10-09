/**
 * Daily practice: a short, planned session that trains both hands, leaning on
 * the left. It rests twice, asks whether your hands feel stiff, and judges
 * speed, control and stability from what the keyboard can report.
 */

import type { UserSettings } from '@music/contracts';
import { Badge, Button, Card, SegmentedControl, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getReviewQueue } from '../api/progress.js';
import { DrillRunner, type BlockResult } from '../daily/DrillRunner.js';
import s from '../daily/daily.module.css';
import { buildPlan, handSeconds, leftShare, type Plan, type PlanItem, type WorkItem } from '../daily/plan.js';
import { dayKey, load, recordDay, recordRun, recordStiffness, save, streak, type DailyData, type Stiffness } from '../daily/storage.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { href } from '../router.js';
import l from '../lesson/lesson.module.css';

const MINUTES = [
  { value: '10', label: '10 min' },
  { value: '12', label: '12 min' },
  { value: '15', label: '15 min' },
] as const;

const MODE_BLURB = { speed: 'Speed', control: 'Control', stability: 'Stability' } as const;

export function DailyPage({ settings }: { settings: UserSettings }) {
  const today = dayKey();
  const [data, setData] = useState<DailyData>(load);
  const [minutes, setMinutes] = useState('12');
  const [running, setRunning] = useState(false);
  const plan = useMemo(() => buildPlan(today, data, Number(minutes)), [today, minutes, running]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((next: DailyData) => {
    setData(next);
    save(next);
  }, []);

  if (running) return <Session plan={plan} data={data} update={update} settings={settings} onExit={() => setRunning(false)} />;

  const doneToday = data.days[today]?.done;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(d);
    return { key, done: !!data.days[key]?.done, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }) };
  });

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className={l.unit}>
      <motion.div variants={fadeUp} className={l.unitHead}>
        <div>
          <span className="ui-eyebrow">Daily practice</span>
          <h1 className="ui-title">Train both hands, a little every day</h1>
          <p className={`ui-muted ${l.small}`}>
            A short session built around your hands: finger independence (with extra work on fingers 3 and 4), hand movement, chord shapes, progressions and note finding. It leans on the left hand, rests twice and checks whether you feel stiff. The app judges what the keyboard reports (timing, how hard each key is pressed, wrong keys); finger numbers are a guide.
          </p>
        </div>
        <span style={{ flex: 'none' }}>
          <Badge tone={doneToday ? 'good' : 'neutral'} data-testid="daily-streak">
            {streak(data.days, today)} day streak
          </Badge>
        </span>
      </motion.div>

      <motion.div variants={fadeUp} className={s.stats}>
        <SegmentedControl label="Session length" options={MINUTES} value={minutes as '10'} onChange={setMinutes} />
        <Badge tone="accent" data-testid="left-share">
          Left hand {Math.round(plan.leftShare * 100)}%
        </Badge>
        {week.map((d) => (
          <Badge key={d.key} tone={d.done ? 'good' : 'neutral'} title={d.key}>
            {d.label}
            {d.done ? ' ✓' : ''}
          </Badge>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="lg">
          <ol className={s.planList} data-testid="plan-list">
            {plan.items.map((it, i) => (
              <li key={i} className={s.planRow}>
                <span className={s.planText}>
                  {it.type === 'work' ? (
                    <>
                      <span className="ui-eyebrow">{it.role}</span>
                      <strong>{it.exercise.title}</strong>
                    </>
                  ) : (
                    <>
                      <span className="ui-eyebrow">Rest</span>
                      <strong>{it.seconds} seconds, and a check on how your hands feel</strong>
                    </>
                  )}
                </span>
                {it.type === 'work' && <Badge>{MODE_BLURB[it.mode]}</Badge>}
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="primary" onClick={() => setRunning(true)} data-testid="start-daily">
              {doneToday ? 'Practise again' : "Start today's practice"}
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

type Stage = { kind: 'item' } | { kind: 'summary'; stopped: boolean };

interface BlockLog {
  item: WorkItem;
  result: BlockResult;
}

function Session({ plan, data, update, settings, onExit }: { plan: Plan; data: DailyData; update: (d: DailyData) => void; settings: UserSettings; onExit: () => void }) {
  const [at, setAt] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: 'item' });
  const [ease, setEase] = useState(1);
  const [logs, setLogs] = useState<BlockLog[]>([]);
  const [pending, setPending] = useState<BlockResult | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const size = settings.keyboardSize as KeyboardSize;
  const item = plan.items[at] as PlanItem | undefined;

  const finish = (stopped: boolean, all: BlockLog[]) => {
    const worked = all.length;
    let next = dataRef.current;
    next = recordDay(next, plan.day, { leftSec: 0, rightSec: 0 }, !stopped || worked >= 3);
    update(next);
    setStage({ kind: 'summary', stopped });
  };

  const advance = (all: BlockLog[]) => {
    setPending(null);
    if (at + 1 >= plan.items.length) finish(false, all);
    else setAt(at + 1);
  };

  const onBlockDone = (w: WorkItem, result: BlockResult) => {
    let next = dataRef.current;
    result.passes.forEach((p, i) => {
      const last = i === result.passes.length - 1;
      next = recordRun(next, w.exercise.id, w.mode, plan.day, { clean: p.clean, score: p.score, tempo: last ? result.next : undefined });
    });
    next = recordDay(next, plan.day, handSeconds(w, result.seconds), false);
    update(next);
    setLogs((x) => [...x, { item: w, result }]);
    setPending(result);
  };

  if (stage.kind === 'summary') return <Summary plan={plan} logs={logs} stopped={stage.stopped} data={data} onExit={onExit} />;
  if (!item) return null;

  return (
    <div className={l.player}>
      <div className={l.playerHead}>
        <button type="button" className={l.back} onClick={onExit} data-testid="daily-exit">
          ← Daily
        </button>
        <span className="ui-muted">
          Block {Math.min(at + 1, plan.items.length)} of {plan.items.length}
        </span>
      </div>
      <ol className={l.progress} aria-label="Session steps">
        {plan.items.map((_, i) => (
          <li key={i} data-state={i < at ? 'done' : i === at ? 'current' : 'todo'}>
            <motion.span className={l.progressFill} initial={false} animate={{ scaleX: i < at ? 1 : i === at ? (pending ? 1 : 0.15) : 0 }} />
          </li>
        ))}
      </ol>
      <Card padding="lg">
        {item.type === 'work' ? (
          <>
            <DrillRunner key={at} item={item} ease={ease} size={size} settings={settings} onDone={(r) => onBlockDone(item, r)} />
            {pending && (
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Button variant="primary" onClick={() => advance(logs)} data-testid="next-block">
                  {at + 1 >= plan.items.length ? 'Finish' : 'Next'}
                </Button>
              </div>
            )}
          </>
        ) : (
          <Rest
            key={at}
            item={item}
            onAnswer={(level) => {
              update(recordStiffness(dataRef.current, plan.day, level));
              if (level === 'stiff') setEase((e) => Math.min(e, 0.85));
              if (level === 'pain') setEase((e) => Math.min(e, 0.75));
            }}
            onDone={() => advance(logs)}
            onStop={() => finish(true, logs)}
          />
        )}
      </Card>
    </div>
  );
}

const CHOICES: { level: Stiffness; label: string }[] = [
  { level: 'loose', label: 'Loose and fine' },
  { level: 'tight', label: 'A little tight' },
  { level: 'stiff', label: 'Stiff' },
  { level: 'pain', label: 'It hurts' },
];

function Rest({ item, onAnswer, onDone, onStop }: { item: Extract<PlanItem, { type: 'rest' }>; onAnswer: (l: Stiffness) => void; onDone: () => void; onStop: () => void }) {
  const [level, setLevel] = useState<Stiffness | null>(item.check ? null : 'loose');
  const [left, setLeft] = useState(item.seconds);
  const total = level === 'stiff' || level === 'pain' ? item.seconds * 2 : item.seconds;
  useEffect(() => {
    if (level === null) return;
    setLeft(total);
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [level, total]);

  if (level === null) {
    return (
      <div className={s.block} data-testid="stiff-check">
        <span className="ui-eyebrow">Check in</span>
        <h2 className="ui-heading">Does it feel stiff?</h2>
        <p className="ui-muted">Be honest; this is how the app knows when to ease off. Shake your hands out loosely while you decide.</p>
        <div className={s.checkChoices}>
          {CHOICES.map((c) => (
            <Button
              key={c.level}
              variant={c.level === 'loose' ? 'secondary' : 'ghost'}
              onClick={() => {
                setLevel(c.level);
                onAnswer(c.level);
              }}
              data-testid={`stiff-${c.level}`}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={s.block} data-testid="rest">
      <span className="ui-eyebrow">Rest</span>
      <div className={s.restTimer}>{left}s</div>
      {level === 'pain' ? (
        <p>Stop if it hurts. Shake your hands out, and rest properly today. Stopping early still counts as a practice day.</p>
      ) : level === 'stiff' ? (
        <p className="ui-muted">Longer rest, and the rest of today goes about 15% slower. Drop your shoulders, let your arms hang, and open and close your hands a few times.</p>
      ) : (
        <p className="ui-muted">Let your hands hang and loosen your wrists. The next block starts when you are ready.</p>
      )}
      <div className={s.introActions}>
        {level !== 'pain' && (
          <Button variant="primary" onClick={onDone} disabled={left > 0 && level !== 'loose'} data-testid="rest-next">
            {left > 0 ? 'Skip rest' : 'Continue'}
          </Button>
        )}
        {level === 'pain' ? (
          <Button variant="primary" onClick={onStop} data-testid="stop-today">
            Stop for today
          </Button>
        ) : (
          <Button variant="ghost" onClick={onStop} data-testid="stop-today">
            Stop for today
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ plan, logs, stopped, data, onExit }: { plan: Plan; logs: BlockLog[]; stopped: boolean; data: DailyData; onExit: () => void }) {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    getReviewQueue()
      .then((q) => live && setDue(q.length))
      .catch(() => live && setDue(null));
    return () => {
      live = false;
    };
  }, []);
  const day = data.days[plan.day];
  const total = (day?.leftSec ?? 0) + (day?.rightSec ?? 0);
  const leftPct = total > 0 ? Math.round(((day?.leftSec ?? 0) / total) * 100) : Math.round(leftShare(logs.map((x) => x.item)) * 100);
  const soft = logs.map((x) => x.result.soft).filter((x): x is NonNullable<BlockResult['soft']> => x !== null);

  return (
    <Card highlight padding="lg" className={l.summary} data-testid="daily-summary">
      <div className={l.summaryInner}>
        <span className="ui-eyebrow">{stopped ? 'Stopped early' : 'Today is done'}</span>
        <div className={`ui-display ui-gradient-text ${l.score}`}>{stopped ? 'Rest up' : 'Well done'}</div>
        <p className="ui-muted">
          {streak(data.days, plan.day)} day streak · left hand {leftPct}% of today's playing.
        </p>
        <div className={s.split} aria-hidden>
          <span className={s.splitLeft} style={{ width: `${leftPct}%` }} />
          <span className={s.splitRight} style={{ width: `${100 - leftPct}%` }} />
        </div>
        <ul className={s.insights}>
          {logs.map((x, i) => (
            <li key={i}>
              <strong>{x.item.exercise.title}</strong>: {MODE_BLURB[x.item.mode]}, {x.result.passes.filter((p) => p.clean).length} of {x.result.passes.length} clean
              {x.item.mode === 'stability' ? `, holds now ${x.result.next}s` : `, now at ${x.result.next} bpm`}
            </li>
          ))}
          {soft.map((f, i) => (
            <li key={`soft-${i}`}>
              Your {f.hand} hand finger {f.finger} pressed about {f.percentBelow}% softer than the rest. That is the one to give extra care.
            </li>
          ))}
          {due !== null && due > 0 && (
            <li>
              {due} lesson skill{due === 1 ? ' is' : 's are'} due for <a href={href.review}>review</a>.
            </li>
          )}
        </ul>
        <div className={l.summaryActions}>
          <Button variant="secondary" onClick={onExit}>
            Back to Daily
          </Button>
          <Button variant="primary" onClick={() => (location.hash = href.review)}>
            Review lessons
          </Button>
        </div>
      </div>
    </Card>
  );
}
