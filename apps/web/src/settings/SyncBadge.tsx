import { Badge, StatusDot, Swap } from '@music/ui';
import type { SyncState } from './useSettings.js';

const LABEL: Record<SyncState, { tone: 'neutral' | 'good' | 'warn' | 'accent'; text: string }> = {
  local: { tone: 'neutral', text: 'Saved in this browser' },
  loading: { tone: 'accent', text: 'Loading your settings' },
  saving: { tone: 'accent', text: 'Saving' },
  saved: { tone: 'good', text: 'Saved to your account' },
  error: { tone: 'warn', text: "Saved here; can't reach your account" },
};

/** Where settings are saved right now. */
export function SyncBadge({ state }: { state: SyncState }) {
  const { tone, text } = LABEL[state];
  return (
    <span data-testid="sync-state" data-state={state}>
      <Swap value={state}>
        <Badge tone={tone}>
          <StatusDot tone={tone} pulse={state === 'loading' || state === 'saving'} />
          {text}
        </Badge>
      </Swap>
    </span>
  );
}
