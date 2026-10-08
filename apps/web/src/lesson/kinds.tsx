/**
 * Runners for the item kinds that don't fit the classic one-keyboard runner.
 * Each kind lives in its own file under ./kinds/ and is listed here, so the
 * pieces that build them don't edit the same code.
 */

import type { TestItemKind } from '@music/contracts';
import { Badge, Button } from '@music/ui';
import type { ComponentType } from 'react';
import type { ItemRunnerProps } from './ItemRunner.js';
import { Progression } from './kinds/Progression.js';
import { ReadStaff } from './kinds/ReadStaff.js';
import { TapRhythm } from './kinds/TapRhythm.js';
import s from './lesson.module.css';

/** Shown for a kind whose runner isn't built yet, so a lesson using it can still be skipped. */
function NotYet({ item, onDone }: ItemRunnerProps) {
  return (
    <div className={s.item} data-testid="kind-not-ready">
      <div className={s.promptRow}>
        <Badge tone="neutral">Coming soon</Badge>
      </div>
      <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
        {item.prompt}
      </h2>
      <p className="ui-muted">This kind of question isn't ready yet.</p>
      <div>
        <Button variant="secondary" onClick={onDone} data-testid="skip">
          Skip
        </Button>
      </div>
    </div>
  );
}

export const KIND_RUNNERS: Partial<Record<TestItemKind, ComponentType<ItemRunnerProps>>> = {
  'play-progression': Progression,
  'read-staff': ReadStaff,
  'tap-rhythm': TapRhythm,
};
