# UI conventions

The app should feel modern, calm and alive: a dark studio look by default,
glassy cards over a slow aurora background, one violet-to-cyan accent, and
motion that confirms every action without getting in the way.

Everything visual comes from `packages/ui`. Run `npm run dev -w @music/ui` to
see every token and component at http://localhost:5174.

## Setup

```tsx
import '@music/ui/styles.css';
import { ThemeProvider } from '@music/ui';

<ThemeProvider>
  <div className="ui-app-bg">…</div>
</ThemeProvider>
```

## Rules

1. **Tokens only.** Colours, spacing, radii, shadows, fonts and timings are CSS
   variables from `tokens.css` (`var(--accent)`, `var(--space-4)`,
   `var(--radius-lg)`). No hex codes or pixel values that already have a token.
   Both themes must work: check dark and light.
2. **Components first.** Use `Button`, `Card`, `Badge`, `StatusDot`, `Kbd`,
   `SegmentedControl`, `Select`, `Switch`, `Swap`, `Feedback` before writing new
   ones. A new reusable component goes in `packages/ui` (ask the integrator).
3. **Meaning colours.** `--good` means right, `--bad` means wrong, `--warn`
   means almost. Never use them for decoration. The accent is for the main
   action and the active key.
4. **Type.** Space Grotesk (`.ui-display`, `.ui-title`) for big moments like
   the chord symbol and page titles; Inter for everything else. Use
   `.ui-eyebrow` for small labels, `.ui-muted` for secondary text, and
   `pretty()` from `@music/theory` so sharps and flats print as ♯ and ♭.
5. **Motion with purpose.** Use the presets in `motion.ts`, never one-off
   numbers:
   - `spring.snappy` for presses, toggles and key feedback;
   - `spring.gentle` for cards and layout;
   - `spring.bouncy` only for celebrations (right answer, unit unlocked);
   - `fadeUp` + `stagger()` when a screen or list appears;
   - `Swap` when a value changes (chord symbol, score);
   - `Feedback` around a test area: green glow and lift when right, red glow
     and shake when wrong.
   Key presses must show within one frame: animate the key highlight with CSS
   transitions (`var(--dur-fast)`), not a spring that delays it.
6. **Reduced motion.** `ThemeProvider` honours the system setting through
   `MotionConfig`, and CSS durations drop to 0. Don't bypass this.
7. **Accessible.** Every control is reachable by keyboard and shows the focus
   ring; icons have labels; text that changes (chord names, test results) sits
   in an `aria-live` region (`Swap` already is one).
8. **Layout.** `.ui-container` for page width, `.ui-stack` and `.ui-row` with
   `gap: var(--space-*)`. Works from 1280px laptops down to tablet width.
