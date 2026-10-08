/**
 * Saved band charts. They live in this browser (localStorage), and a share
 * link carries a whole chart in the URL, so charts work without signing in.
 */

import { ChordChartSchema, type ChordChart } from '@music/contracts';
import { newId } from '@music/charts';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'music.charts.v1';

export interface SavedChart {
  chart: ChordChart;
}

function readAll(): SavedChart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
      const parsed = ChordChartSchema.safeParse(item);
      return parsed.success ? [{ chart: parsed.data }] : [];
    });
  } catch {
    return [];
  }
}

function writeAll(list: SavedChart[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map((c) => c.chart)));
  } catch {
    // Storage full or blocked: the chart still shows, it just isn't kept.
  }
  window.dispatchEvent(new Event('charts-changed'));
}

/** Newest first. */
export function listCharts(): SavedChart[] {
  return readAll().sort((a, b) => b.chart.updatedAt.localeCompare(a.chart.updatedAt));
}

export function getChart(id: string): ChordChart | null {
  return readAll().find((c) => c.chart.id === id)?.chart ?? null;
}

export function saveChart(chart: ChordChart): void {
  const list = readAll().filter((c) => c.chart.id !== chart.id);
  writeAll([...list, { chart: { ...chart, updatedAt: new Date().toISOString() } }]);
}

export function deleteChart(id: string): void {
  writeAll(readAll().filter((c) => c.chart.id !== id));
}

/**
 * Keep a chart that came from somewhere else (a share link, song analysis).
 * It gets a fresh id unless one with the same id and content is already saved.
 * Returns the id it was saved under.
 */
export function importChart(chart: ChordChart): string {
  const existing = getChart(chart.id);
  if (existing && JSON.stringify(existing) === JSON.stringify(chart)) return chart.id;
  const copy = { ...chart, id: existing ? newId() : chart.id };
  saveChart(copy);
  return copy.id;
}

/** The saved charts, kept up to date when any screen or tab changes them. */
export function useSavedCharts(): SavedChart[] {
  const [list, setList] = useState(listCharts);
  const refresh = useCallback(() => setList(listCharts()), []);
  useEffect(() => {
    window.addEventListener('charts-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('charts-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  return list;
}
