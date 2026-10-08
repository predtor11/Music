/**
 * Review: a practice session built from the skills that are due, weakest first.
 * Placeholder until the review work lands; that work owns this file.
 */

import { Badge, Card } from '@music/ui';
import type { UserSettings } from '@music/contracts';

export function ReviewPage({ settings: _settings }: { settings: UserSettings }) {
  return (
    <Card padding="lg" data-testid="page-review">
      <Badge tone="neutral">Coming soon</Badge>
      <h1 className="ui-title">Review</h1>
      <p className="ui-muted">Practice for your weak spots will show here.</p>
    </Card>
  );
}
