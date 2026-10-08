/**
 * Unit test: the practice service hands out the items one at a time
 * (next-item) and scores the run; nothing is lit up to help.
 */

import type { SessionSummary, TestItem, Unit, UserSettings } from '@music/contracts';
import { C_MAJOR } from '@music/theory';
import { Badge, Card } from '@music/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getUnit, nextItem } from '../api/client.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { ItemRunner } from '../lesson/ItemRunner.js';
import { Summary } from '../lesson/Summary.js';
import { usePractice } from '../lesson/usePractice.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../lesson/lesson.module.css';

export function CheckpointPage({ unitId, settings }: { unitId: string; settings: UserSettings }) {
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    getUnit(unitId).then(setUnit, (e: Error) => setError(e.message));
  }, [unitId]);

  if (error) return <LoadError what="this unit test" message={error} />;
  if (!unit) return <Loading />;
  return <CheckpointRun key={run} unit={unit} settings={settings} onRetry={() => setRun((r) => r + 1)} />;
}

function CheckpointRun({ unit, settings, onRetry }: { unit: Unit; settings: UserSettings; onRetry: () => void }) {
  const practice = usePractice('checkpoint', unit.id, unit.checkpoint.passPercent);
  const [item, setItem] = useState<TestItem | null>(null);
  const [answered, setAnswered] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const localIndex = useRef(0);
  const items = unit.checkpoint.items;

  const { register, sessionId, save, finish } = practice;
  useEffect(() => register(items.map((i) => i.id)), [items, register]);

  // Online the service picks the next item; offline we walk the unit's list.
  const advance = useCallback(async () => {
    let next: TestItem | null;
    if (sessionId) {
      try {
        next = await nextItem(sessionId);
      } catch {
        next = items[localIndex.current] ?? null;
      }
    } else {
      next = items[localIndex.current] ?? null;
    }
    localIndex.current += 1;
    if (next) setItem(next);
    else setSummary(await finish());
  }, [sessionId, items, finish]);

  useEffect(() => {
    if (save !== 'starting' && !item && !summary) void advance();
  }, [save, item, summary, advance]);

  if (summary) return <Summary summary={summary} title={`Unit ${unit.order} test`} onRetry={onRetry} backHref={href.lessons} offline={save === 'offline'} />;
  if (!item) return <Loading />;

  return (
    <div className={s.player}>
      <div className={s.playerHead}>
        <a href={href.lessons} className={s.back}>
          ← Lessons
        </a>
        <div className={s.titleBlock}>
          <h1 className="ui-title">Unit {unit.order} test</h1>
          <span className="ui-muted">
            {unit.title}. Pass with {unit.checkpoint.passPercent}% right on the first try.
          </span>
        </div>
        {save === 'offline' && <Badge tone="warn">Not saving</Badge>}
      </div>
      <Card padding="lg" className={s.stepCard}>
        <span className={`ui-muted ${s.small}`} data-testid="checkpoint-count">
          Question {Math.min(answered + 1, items.length)} of {items.length}
        </span>
        <ItemRunner
          item={item}
          mode="quiz"
          size={settings.keyboardSize as KeyboardSize}
          naming={settings.noteNaming}
          keyOf={C_MAJOR}
          onAttempt={practice.record}
          onDone={() => {
            setAnswered((a) => a + 1);
            void advance();
          }}
        />
      </Card>
    </div>
  );
}
