/**
 * Why a lesson or test isn't being saved: the practice server is down, or
 * you're signed out (the server answered 401).
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
      <Badge tone="warn" title="Your answers aren't being saved because the practice server can't be reached." data-testid="offline">
        Not saving
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
        This score isn't saved because you're not signed in. <a href={href.signin}>Sign in to save your progress.</a>
      </p>
    );
  }
  if (save === 'offline') return <p className={className}>The practice server wasn't reachable, so this score isn't saved.</p>;
  return null;
}
