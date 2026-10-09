/**
 * App shell: header with navigation, one shared keyboard input, and the
 * current screen.
 */

import type { UserSettings } from '@music/contracts';
import { Badge, Button, StatusDot, fadeUp, spring, useTheme } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useKeySound } from './audio/useKeySound.js';
import { useAuth } from './auth/AuthProvider.js';
import authStyles from './auth/auth.module.css';
import { NoteInputProvider, useNoteInput } from './input/NoteInput.js';
import { BandTalkPage } from './pages/BandTalkPage.js';
import { ChartEditPage } from './pages/ChartEditPage.js';
import { ChartImportPage, ChartPage } from './pages/ChartPage.js';
import { ChartsPage } from './pages/ChartsPage.js';
import { CheckpointPage } from './pages/CheckpointPage.js';
import { ChordNamerPage } from './pages/ChordNamerPage.js';
import { HandSessionPage } from './pages/HandSessionPage.js';
import { EarPage } from './pages/EarPage.js';
import { EarSessionPage } from './pages/EarSessionPage.js';
import { HandsPage } from './pages/HandsPage.js';
import { JamPage } from './pages/JamPage.js';
import { LessonPage } from './pages/LessonPage.js';
import { LessonsPage } from './pages/LessonsPage.js';
import { ProgressPage } from './pages/ProgressPage.js';
import { ReviewPage } from './pages/ReviewPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { SignInPage } from './pages/SignInPage.js';
import { href, useRoute, type Route } from './router.js';
import { useSettings } from './settings/useSettings.js';
import s from './App.module.css';

type Theme = UserSettings['theme'];

const THEME_NEXT: Record<Theme, Theme> = { dark: 'light', light: 'system', system: 'dark' };
const THEME_LABEL: Record<Theme, string> = { dark: 'Dark', light: 'Light', system: 'Auto' };

const NAV = [
  { id: 'chords', label: 'Chord Namer', href: href.chords },
  { id: 'lessons', label: 'Lessons', href: href.lessons },
  { id: 'hands', label: 'Hands', href: href.hands },
  { id: 'ear', label: 'By Ear', href: href.ear },
  { id: 'jam', label: 'Jam', href: href.jam() },
  { id: 'bandtalk', label: 'Band talk', href: href.bandtalk() },
  { id: 'review', label: 'Review', href: href.review },
  { id: 'charts', label: 'Charts', href: href.charts },
  { id: 'progress', label: 'Progress', href: href.progress },
] as const;

type Section = (typeof NAV)[number]['id'] | null;

function section(route: Route): Section {
  switch (route.page) {
    case 'chords':
    case 'review':
    case 'progress':
    case 'jam':
    case 'bandtalk':
      return route.page;
    case 'hands':
    case 'hand':
      return 'hands';
    case 'ear':
    case 'ear-level':
      return 'ear';
    case 'lessons':
    case 'lesson':
    case 'checkpoint':
      return 'lessons';
    case 'charts':
    case 'chart':
    case 'chartEdit':
    case 'chartImport':
      return 'charts';
    default:
      return null;
  }
}

/** Small keyboard status for the header, so every screen shows whether MIDI is live. */
function MidiStatus() {
  const { midi } = useNoteInput();
  const live = midi.inputs.filter((i) => i.connected);
  if (midi.status === 'ready' && live.length > 0) {
    return (
      <Badge tone="good" data-testid="header-midi">
        <StatusDot tone="good" pulse />
        {live.length === 1 ? live[0]!.name : `${live.length} keyboards`}
      </Badge>
    );
  }
  if (midi.status === 'idle' || midi.status === 'denied') {
    return (
      <Button size="sm" variant="secondary" onClick={midi.connect} data-testid="header-connect">
        <StatusDot tone="neutral" />
        Connect keyboard
      </Button>
    );
  }
  return (
    <Badge tone={midi.status === 'unsupported' ? 'bad' : 'warn'} data-testid="header-midi">
      <StatusDot tone={midi.status === 'unsupported' ? 'bad' : 'warn'} />
      {midi.status === 'unsupported' ? 'No MIDI in this browser' : midi.status === 'requesting' ? 'Connecting' : 'No keyboard found'}
    </Badge>
  );
}

/** Sound for on-screen and computer keys (see useKeySound). */
function KeySound() {
  useKeySound();
  return null;
}

/** Header account button: Sign in, or your initial when signed in. */
function AccountButton({ active }: { active: boolean }) {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-in' && auth.user) {
    const email = auth.user.email ?? 'Account';
    return (
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => (location.hash = href.settings)}
        aria-label={`Account: ${email}`}
        title={email}
        data-testid="account"
        data-signed-in="true"
      >
        <span className={authStyles.avatar} aria-hidden>
          {email.charAt(0)}
        </span>
        Account
      </Button>
    );
  }
  return (
    <Button variant="primary" size="sm" onClick={() => (location.hash = href.signin)} data-testid="account" data-signed-in="false">
      Sign in
    </Button>
  );
}

export function App() {
  const auth = useAuth();
  const [settings, update, sync] = useSettings(auth.user?.id ?? null);
  const theme = useTheme();
  const { setSetting: applyTheme } = theme;
  // Settings own the theme (so it follows your account); ThemeProvider applies it.
  useEffect(() => applyTheme(settings.theme), [applyTheme, settings.theme]);
  const route = useRoute();
  const current = section(route);
  const pageKey =
    route.page === 'lesson'
      ? `lesson-${route.id}`
      : route.page === 'checkpoint'
        ? `cp-${route.unitId}`
        : route.page === 'hand'
          ? `hand-${route.id}`
          : route.page === 'ear-level'
            ? `ear-${route.id}`
            : route.page === 'chart' || route.page === 'chartEdit'
              ? `${route.page}-${route.id ?? 'new'}`
              : route.page;

  return (
    <NoteInputProvider settings={settings} update={update}>
      <KeySound />
      <div className={`ui-container ${s.shell}`}>
        <motion.header className={s.header} variants={fadeUp} initial="hidden" animate="show">
          <a className={s.brand} href={href.chords}>
            <span className={s.logo} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className={s.brandText}>
              <span className={s.brandName}>Music Theory Trainer</span>
              <span className={`ui-muted ${s.tagline}`}>Learn at your pace, on your keyboard.</span>
            </span>
          </a>
          <nav className={s.nav} aria-label="Main">
            {NAV.map((n) => (
              <a key={n.id} href={n.href} className={s.navLink} aria-current={current === n.id ? 'page' : undefined} data-testid={`nav-${n.id}`}>
                {current === n.id && <motion.span layoutId="nav-pill" className={s.navPill} transition={spring.snappy} />}
                <span className={s.navLabel}>{n.label}</span>
              </a>
            ))}
          </nav>
          <div className={s.tools}>
            <MidiStatus />
            <Button variant="ghost" size="sm" onClick={() => update({ theme: THEME_NEXT[settings.theme] })} data-testid="theme">
              Theme: {THEME_LABEL[settings.theme]}
            </Button>
            <Button
              variant={route.page === 'settings' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => (location.hash = href.settings)}
              aria-current={route.page === 'settings' ? 'page' : undefined}
              data-testid="nav-settings"
            >
              Settings
            </Button>
            <AccountButton active={route.page === 'signin'} />
          </div>
        </motion.header>

        <AnimatePresence mode="wait">
          <motion.main key={pageKey} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            {route.page === 'chords' && <ChordNamerPage settings={settings} update={update} />}
            {route.page === 'lessons' && <LessonsPage />}
            {route.page === 'lesson' && <LessonPage id={route.id} settings={settings} />}
            {route.page === 'checkpoint' && <CheckpointPage unitId={route.unitId} settings={settings} />}
            {route.page === 'hands' && <HandsPage />}
            {route.page === 'hand' && <HandSessionPage id={route.id} settings={settings} />}
            {route.page === 'ear' && <EarPage />}
            {route.page === 'ear-level' && <EarSessionPage id={route.id} settings={settings} />}
            {route.page === 'jam' && <JamPage setup={route.setup} settings={settings} />}
            {route.page === 'bandtalk' && <BandTalkPage id={route.id} settings={settings} />}
            {route.page === 'review' && <ReviewPage settings={settings} />}
            {route.page === 'progress' && <ProgressPage />}
            {route.page === 'charts' && <ChartsPage />}
            {route.page === 'chart' && <ChartPage id={route.id} settings={settings} />}
            {route.page === 'chartEdit' && <ChartEditPage id={route.id} settings={settings} />}
            {route.page === 'chartImport' && <ChartImportPage data={route.data} settings={settings} />}
            {route.page === 'settings' && <SettingsPage settings={settings} update={update} sync={sync} />}
            {route.page === 'signin' && <SignInPage />}
          </motion.main>
        </AnimatePresence>
      </div>
    </NoteInputProvider>
  );
}
