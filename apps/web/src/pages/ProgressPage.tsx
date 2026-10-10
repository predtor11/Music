/**
 * Progress report: accuracy by topic, repeat mistakes, speed, practice habit
 * and what to do next, from GET /api/progress/reports/weekly. The last report
 * that loaded is kept on this device, so offline the screen shows it with a
 * gentle note instead of an error.
 */

import type { ProgressReport } from '@music/contracts';
import { Badge, Button, Card } from '@music/ui';
import { useEffect, useState } from 'react';
import { ApiError, getReport } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.js';
import { loadReport, savedAgo, saveReport, type SavedReport } from '../progress/cache.js';
import { isEmptyReport } from '../progress/format.js';
import { EmptyReport, Report } from '../progress/Report.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../progress/progress.module.css';

export function ProgressPage() {
  const auth = useAuth();
  // The signed-in user, or a fixed id when sign-in is off, so each person keeps their own saved copy.
  const owner = auth.user?.id ?? (auth.status === 'off' ? 'local' : null);
  const [tzOffset] = useState(() => -new Date().getTimezoneOffset());
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [offline, setOffline] = useState<SavedReport | 'none' | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    if (auth.status === 'loading') return;
    let live = true;
    getReport(tzOffset)
      .then((r) => {
        if (!live) return;
        setReport(r);
        setOffline(null);
        if (owner) saveReport(owner, { report: r, tzOffset, savedAt: new Date().toISOString() });
      })
      .catch((e: Error) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 0) setOffline((owner && loadReport(owner)) || 'none');
        else setError(e);
      });
    return () => {
      live = false;
    };
  }, [tzOffset, owner, auth.status]);

  if (error instanceof ApiError && error.status === 401) {
    return (
      <Card padding="lg" className={s.signin} data-testid="progress-signin">
        <h1 className="ui-title">Your progress</h1>
        <p className="ui-muted">Sign in so your practice is saved and your weekly report can follow you.</p>
        <div>
          <Button variant="primary" onClick={() => (location.hash = href.signin)}>
            Sign in
          </Button>
        </div>
      </Card>
    );
  }
  if (error) return <LoadError what="your progress" message={error.message} />;

  if (offline === 'none') {
    return (
      <Card padding="lg" className={s.signin} data-testid="progress-offline-empty">
        <h1 className="ui-title">Your progress</h1>
        <p className="ui-muted">You're offline, and there's no saved report on this device yet. It will show up here when you're back online.</p>
        <div>
          <Button variant="secondary" onClick={() => location.reload()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }
  if (offline) {
    return (
      <div className={s.page}>
        <Badge tone="warn" data-testid="progress-offline-note" role="status">
          You're offline. Showing your report as last saved {savedAgo(offline.savedAt)}.
        </Badge>
        {isEmptyReport(offline.report) ? <EmptyReport report={offline.report} tzOffset={offline.tzOffset} /> : <Report report={offline.report} tzOffset={offline.tzOffset} />}
      </div>
    );
  }
  if (!report) return <Loading />;
  return isEmptyReport(report) ? <EmptyReport report={report} tzOffset={tzOffset} /> : <Report report={report} tzOffset={tzOffset} />;
}
