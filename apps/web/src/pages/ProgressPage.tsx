/**
 * Progress report: accuracy by topic, repeat mistakes, speed, practice habit
 * and what to do next, from GET /api/progress/reports/weekly.
 */

import type { ProgressReport } from '@music/contracts';
import { Button, Card } from '@music/ui';
import { useEffect, useState } from 'react';
import { ApiError, getReport } from '../api/client.js';
import { isEmptyReport } from '../progress/format.js';
import { EmptyReport, Report } from '../progress/Report.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../progress/progress.module.css';

export function ProgressPage() {
  const [tzOffset] = useState(() => -new Date().getTimezoneOffset());
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    let live = true;
    getReport(tzOffset)
      .then((r) => live && setReport(r))
      .catch((e: Error) => live && setError(e));
    return () => {
      live = false;
    };
  }, [tzOffset]);

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
  if (!report) return <Loading />;
  return isEmptyReport(report) ? <EmptyReport report={report} tzOffset={tzOffset} /> : <Report report={report} tzOffset={tzOffset} />;
}
