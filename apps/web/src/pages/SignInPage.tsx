/**
 * Sign in or create an account (Supabase Auth, email and password), so
 * settings and progress follow you to any browser.
 */

import { Badge, Button, Card, SegmentedControl, fadeUp, shake, stagger } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import s from '../auth/auth.module.css';
import { href } from '../router.js';

type Mode = 'signin' | 'signup';

const MODES = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
] as const;

const MIN_PASSWORD = 6;

export function SignInPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();

  // Signed in (here or by a confirmation link): go on to the lessons.
  useEffect(() => {
    if (auth.status === 'signed-in') location.hash = href.lessons;
  }, [auth.status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      setError(`Choose a password with at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(email, password);
      } else {
        const result = await auth.signUp(email, password);
        if (!result.signedIn) setConfirmEmail(result.confirmEmail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === 'off') {
    return (
      <div className={s.page}>
        <Card padding="lg" className={s.card} data-testid="page-signin">
          <Badge tone="warn">Not set up</Badge>
          <h1 className="ui-title">Sign in</h1>
          <p className="ui-muted">
            Sign-in isn't set up on this computer yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the
            .env file and restart the app. Until then, your settings are saved in this browser.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Card padding="lg" className={s.card} data-testid="page-signin" appear>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
          <motion.p className="ui-eyebrow" variants={fadeUp}>
            Your account
          </motion.p>
          <motion.h1 className="ui-title" variants={fadeUp}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </motion.h1>
          <motion.p className="ui-muted" variants={fadeUp}>
            Your settings and progress follow you to any browser.
          </motion.p>

          <AnimatePresence mode="wait" initial={false}>
            {confirmEmail ? (
              <motion.div key="confirm" className={s.done} variants={fadeUp} initial="hidden" animate="show" exit="exit" data-testid="confirm-email">
                <Badge tone="good">Check your email</Badge>
                <p>
                  We sent a link to <strong>{confirmEmail}</strong>. Open it to confirm your address, then come back and sign in.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmEmail(null);
                    setMode('signin');
                    setPassword('');
                  }}
                >
                  Back to sign in
                </Button>
              </motion.div>
            ) : (
              <motion.form key="form" className={s.form} onSubmit={submit} variants={fadeUp} initial="hidden" animate="show" exit="exit" noValidate>
                <div className={s.mode} data-testid="auth-mode">
                  <SegmentedControl
                    label="Sign in or create an account"
                    value={mode}
                    options={MODES}
                    onChange={(m) => {
                      setMode(m);
                      setError(null);
                    }}
                  />
                </div>
                <label className={s.field} htmlFor={emailId}>
                  <span className="ui-field-label">Email</span>
                  <input
                    id={emailId}
                    className={s.input}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!error}
                    data-testid="auth-email"
                  />
                </label>
                <label className={s.field} htmlFor={passwordId}>
                  <span className="ui-field-label">Password</span>
                  <input
                    id={passwordId}
                    className={s.input}
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                    data-testid="auth-password"
                  />
                  {mode === 'signup' && <span className={`ui-muted ${s.hint}`}>At least {MIN_PASSWORD} characters.</span>}
                </label>
                <motion.p key={error ?? ''} className={s.error} role="alert" aria-live="polite" data-testid="auth-error" animate={error ? shake : undefined}>
                  {error}
                </motion.p>
                <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy || !email || !password} data-testid="auth-submit">
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </Card>
    </div>
  );
}
