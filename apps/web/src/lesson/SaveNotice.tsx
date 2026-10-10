/**
 * Where a lesson's answers are waiting: on this device until the practice
 * server can be reached, or until you sign in. Nothing is lost either way;
 * the outbox (see ../offline) sends them later.
 */

import { Badge, Button } from '@music/ui';
import { href } from '../router.js';
import type { SaveState } from './usePractice.js';

/** Small notice for the lesson header; nothing while saving works. */
export function SaveBadge({ save }: { save: SaveState }) {
  if (save === 'signed-out') {
    return (
      <Button size="sm" variant="secondary" onClick={() => (location.hash = href.signin)} data-testid="save-signin">
        Sign in to save your progress
      </Button>
    );
  }
  if (save === 'offline') {
    return (
      <Badge tone="warn" title="Your answers are kept on this device and will be saved when the practice server can be reached." data-testid="offline">
        Saved on this device
      </Badge>
    );
  }
  return null;
}

/** One line for the end-of-lesson summary. */
export function SaveSummaryNote({ save, className }: { save: SaveState; className?: string }) {
  if (save === 'signed-out') {
    return (
      <p className={className} data-testid="summary-signin">
        This score is kept on this device because you're not signed in. <a href={href.signin}>Sign in to save your progress.</a>
      </p>
    );
  }
  if (save === 'offline') {
    return (
      <p className={className} data-testid="summary-offline">
        You're offline, or the practice server isn't reachable. This score is kept on this device and will be saved when you're back online.
      </p>
    );
  }
  return null;
}
