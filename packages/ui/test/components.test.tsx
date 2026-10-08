import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge, Button, SegmentedControl, Swap, Switch, ThemeProvider, useTheme } from '../src/index.js';

afterEach(cleanup);

describe('ThemeProvider', () => {
  it('sets data-theme on <html> and switches it', () => {
    function Toggle() {
      const { theme, setSetting } = useTheme();
      return <button onClick={() => setSetting(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>;
    }
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('components', () => {
  it('Button clicks and shows its variant', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Connect
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Connect' });
    expect(b.dataset.variant).toBe('primary');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Button is disabled while loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('SegmentedControl reports the picked option', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Note names"
        value="western"
        onChange={onChange}
        options={[
          { value: 'western', label: 'C D E' },
          { value: 'sargam', label: 'Sa Re Ga' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'C D E' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Sa Re Ga' }));
    expect(onChange).toHaveBeenCalledWith('sargam');
  });

  it('Switch toggles', () => {
    const onChange = vi.fn();
    render(<Switch label="Sound" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Swap shows the new value', async () => {
    const { rerender } = render(<Swap value="C">C</Swap>);
    await act(async () => rerender(<Swap value="Am">Am</Swap>));
    expect(screen.getByText('Am')).toBeInTheDocument();
  });

  it('Badge carries its tone', () => {
    render(<Badge tone="good">Correct</Badge>);
    expect(screen.getByText('Correct').dataset.tone).toBe('good');
  });
});
