import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayStrip, Meter, Ring, Sparkline, StatTile } from '../src/index.js';

afterEach(cleanup);

describe('charts', () => {
  it('StatTile shows its label, value and unit', () => {
    render(<StatTile label="Practice" value={42} unit="min" hint="5 sessions" data-testid="t" />);
    const tile = screen.getByTestId('t');
    expect(tile).toHaveTextContent('Practice');
    expect(tile).toHaveTextContent('42min');
    expect(tile).toHaveTextContent('5 sessions');
  });

  it('Ring and Meter are labelled for screen readers', () => {
    render(
      <>
        <Ring value={0.8} label="80% right" />
        <Meter value={3} max={6} label="3 times" />
      </>,
    );
    expect(screen.getByRole('img', { name: '80% right' })).toBeInTheDocument();
    const meter = screen.getByRole('meter', { name: '3 times' });
    expect(meter).toHaveAttribute('aria-valuenow', '3');
  });

  it('Sparkline places one focusable point per value and shows a tooltip', () => {
    render(
      <Sparkline
        label="Intervals"
        slots={7}
        points={[
          { slot: 6, value: 1, label: 'Sun: 100%' },
          { slot: 0, value: 0.5, label: 'Mon: 50%' },
        ]}
        edges={['Mon', 'Sun']}
      />,
    );
    const dots = screen.getAllByRole('img');
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['Mon: 50%', 'Sun: 100%']);
    expect(dots[0]!.style.left).toBe('4%');
    expect(dots[1]!.style.left).toBe('96%');
    fireEvent.focus(dots[1]!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sun: 100%');
    fireEvent.blur(dots[1]!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('DayStrip marks practised days', () => {
    render(
      <DayStrip
        days={[
          { label: 'Mo', active: true, title: 'Monday: practised' },
          { label: 'Tu', active: false, today: true, title: 'Tuesday: no practice' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-active', 'true');
    expect(items[1]).toHaveAttribute('data-today', 'true');
  });
});
