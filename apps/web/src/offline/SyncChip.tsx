import { Badge, StatusDot, type Tone } from '@music/ui';
import { useAuth } from '../auth/AuthProvider.js';
import { chipFor, useBrowserOnline, useSyncSnapshot, type ChipState } from './useSyncStatus.js';

const TONE: Record<ChipState, Tone> = { online: 'neutral', offline: 'warn', pending: 'warn', syncing: 'accent' };

/** Small header chip: Online, Offline, "N to sync" or Syncing…. Quiet when all is well. */
export function SyncChip() {
  const online = useBrowserOnline();
  const snapshot = useSyncSnapshot();
  const auth = useAuth();
  const chip = chipFor(online, snapshot, auth.status === 'off' || auth.status === 'signed-in');
  return (
    <Badge tone={TONE[chip.state]} title={chip.title} data-testid="sync-chip" data-state={chip.state} role="status" aria-live="polite">
      <StatusDot tone={TONE[chip.state]} pulse={chip.state === 'syncing'} />
      {chip.label}
    </Badge>
  );
}
