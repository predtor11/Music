/**
 * Settings: note names (Western, sargam or both), keyboard size and theme, saved to your account.
 * Placeholder until the sign-in and settings work lands; that work owns this file.
 */

import { Badge, Card } from '@music/ui';
import type { UserSettings } from '@music/contracts';

export function SettingsPage({ settings: _settings, update: _update }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void }) {
  return (
    <Card padding="lg" data-testid="page-settings">
      <Badge tone="neutral">Coming soon</Badge>
      <h1 className="ui-title">Settings</h1>
      <p className="ui-muted">Note names, keyboard size and theme will be set here.</p>
    </Card>
  );
}
