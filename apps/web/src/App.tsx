/**
 * App shell: header with navigation, one shared keyboard input, and the
 * current screen.
 */

import { Badge, Button, StatusDot, fadeUp, spring, useTheme, type ThemeSetting } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { NoteInputProvider, useNoteInput } from './input/NoteInput.js';
import { CheckpointPage } from './pages/CheckpointPage.js';
import { ChordNamerPage } from './pages/ChordNamerPage.js';
import { LessonPage } from './pages/LessonPage.js';
import { LessonsPage } from './pages/LessonsPage.js';
import { ProgressPage } from './pages/ProgressPage.js';
import { ReviewPage } from './pages/ReviewPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { SignInPage } from './pages/SignInPage.js';
import { href, useRoute, type Route } from './router.js';
import { useSettings } from './settings/useSettings.js';
import s from './App.module.css';

const THEME_NEXT: Record<ThemeSetting, ThemeSetting> = { dark: 'light', light: 'system', system: 'dark' };
const THEME_LABEL: Record<ThemeSetting, string> = { dark: 'Dark', light: 'Light', system: 'Auto' };

const NAV = [
  { id: 'chords', label: 'Chord Namer', href: href.chords },
  { id: 'lessons', label: 'Lessons', href: href.lessons },
  { id: 'review', label: 'Review', href: href.review },
  { id: 'progress', label: 'Progress', href: href.progress },
] as const;

type Section = (typeof NAV)[number]['id'] | null;

function section(route: Route): Section {
  switch (route.page) {
    case 'chords':
    case 'review':
    case 'progress':
      return route.page;
    case 'lessons':
    case 'lesson':
    case 'checkpoint':
      return 'lessons';
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

export function App() {
  const [settings, update] = useSettings();
  const theme = useTheme();
  const route = useRoute();
  const current = section(route);
  const pageKey = route.page === 'lesson' ? `lesson-${route.id}` : route.page === 'checkpoint' ? `cp-${route.unitId}` : route.page;

  return (
    <NoteInputProvider settings={settings} update={update}>
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
            <Button variant="ghost" size="sm" onClick={() => theme.setSetting(THEME_NEXT[theme.setting])} data-testid="theme">
              Theme: {THEME_LABEL[theme.setting]}
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
          </div>
        </motion.header>

        <AnimatePresence mode="wait">
          <motion.main key={pageKey} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            {route.page === 'chords' && <ChordNamerPage settings={settings} update={update} />}
            {route.page === 'lessons' && <LessonsPage />}
            {route.page === 'lesson' && <LessonPage id={route.id} settings={settings} />}
            {route.page === 'checkpoint' && <CheckpointPage unitId={route.unitId} settings={settings} />}
            {route.page === 'review' && <ReviewPage settings={settings} />}
            {route.page === 'progress' && <ProgressPage />}
            {route.page === 'settings' && <SettingsPage settings={settings} update={update} />}
            {route.page === 'signin' && <SignInPage />}
          </motion.main>
        </AnimatePresence>
      </div>
    </NoteInputProvider>
  );
}
