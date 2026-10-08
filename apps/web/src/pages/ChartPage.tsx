/** One saved chart, or one opened from a share link. */

import type { UserSettings } from '@music/contracts';
import { decodeChart } from '@music/charts';
import { Button, Card } from '@music/ui';
import { useMemo, useState } from 'react';
import { ChartViewer } from '../charts/ChartViewer.js';
import { getChart, importChart, saveChart, useSavedCharts } from '../charts/store.js';
import { href } from '../router.js';

function Missing({ title, text }: { title: string; text: string }) {
  return (
    <Card padding="lg" data-testid="chart-missing">
      <h1 className="ui-title">{title}</h1>
      <p className="ui-muted">{text}</p>
      <Button variant="primary" onClick={() => (location.hash = href.charts)}>
        Your charts
      </Button>
    </Card>
  );
}

export function ChartPage({ id, settings }: { id: string; settings: UserSettings }) {
  const saved = useSavedCharts();
  const chart = useMemo(() => saved.find((c) => c.chart.id === id)?.chart ?? getChart(id), [saved, id]);
  if (!chart) return <Missing title="Chart not found" text="It may have been deleted, or saved in another browser." />;
  return (
    <ChartViewer
      chart={chart}
      settings={settings}
      onSaveKey={saveChart}
      actions={
        <>
          <Button variant="ghost" onClick={() => (location.hash = href.charts)}>
            All charts
          </Button>
          <Button variant="secondary" onClick={() => (location.hash = href.chartEdit(chart.id))} data-testid="chart-edit">
            Edit
          </Button>
        </>
      }
    />
  );
}

export function ChartImportPage({ data, settings }: { data: string; settings: UserSettings }) {
  const chart = useMemo(() => decodeChart(data), [data]);
  const [savedId, setSavedId] = useState<string | null>(null);
  if (!chart) return <Missing title="This link isn't a chart" text="The link may have been cut short when it was copied. Ask for it again." />;
  return (
    <ChartViewer
      chart={chart}
      settings={settings}
      actions={
        savedId ? (
          <Button variant="secondary" onClick={() => (location.hash = href.chart(savedId))}>
            Open saved copy
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setSavedId(importChart(chart))} data-testid="chart-import">
            Save to my charts
          </Button>
        )
      }
    />
  );
}
