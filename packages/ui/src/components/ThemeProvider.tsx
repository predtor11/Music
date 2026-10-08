import { MotionConfig } from 'motion/react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  setting: ThemeSetting;
  theme: ResolvedTheme;
  setSetting: (setting: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'music.theme';

function readStored(): ThemeSetting | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' || v === 'system' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): ResolvedTheme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Sets data-theme on <html>, remembers the choice, and turns animations down
 * when the system asks for reduced motion. Wrap the whole app in it once.
 */
export function ThemeProvider({ children, defaultSetting = 'dark' }: { children: ReactNode; defaultSetting?: ThemeSetting }) {
  const [setting, setSettingState] = useState<ThemeSetting>(() => readStored() ?? defaultSetting);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const theme: ResolvedTheme = setting === 'system' ? system : setting;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      setting,
      theme,
      setSetting: (next) => {
        setSettingState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Storage can be unavailable (private mode); the choice still applies.
        }
      },
    }),
    [setting, theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
