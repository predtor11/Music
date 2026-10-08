import { motion } from 'motion/react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import {
  Badge,
  Button,
  Card,
  Feedback,
  Kbd,
  SegmentedControl,
  Select,
  StatusDot,
  Swap,
  Switch,
  ThemeProvider,
  fadeUp,
  stagger,
  useTheme,
  type FeedbackSignal,
} from '../src/index.js';

const CHORDS = [
  { symbol: 'C', name: 'C major', roman: 'I', inv: 'root position' },
  { symbol: 'Am7', name: 'A minor 7th', roman: 'vi7', inv: 'root position' },
  { symbol: 'F/A', name: 'F major', roman: 'IV/3', inv: '1st inversion' },
  { symbol: 'G7', name: 'G dominant 7th', roman: 'V7', inv: 'root position' },
];

function Playground() {
  const { setting, setSetting } = useTheme();
  const [i, setI] = useState(0);
  const [naming, setNaming] = useState<'western' | 'sargam' | 'both'>('western');
  const [sound, setSound] = useState(true);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % CHORDS.length), 1800);
    return () => clearInterval(t);
  }, []);
  const chord = CHORDS[i]!;

  return (
    <div className="ui-app-bg">
      <motion.main className="ui-container ui-stack" style={{ gap: 'var(--space-8)', paddingBlock: 'var(--space-12)' }} variants={stagger(0.06)} initial="hidden" animate="show">
        <motion.header variants={fadeUp} className="ui-row" style={{ justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div className="ui-stack" style={{ gap: 'var(--space-1)' }}>
            <span className="ui-eyebrow">Design system</span>
            <h1 className="ui-title">
              Music <span className="ui-gradient-text">Theory Trainer</span>
            </h1>
          </div>
          <SegmentedControl
            label="Theme"
            value={setting}
            onChange={setSetting}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </motion.header>

        <motion.div variants={fadeUp}>
          <Card highlight padding="lg">
            <div className="ui-row" style={{ justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <Badge tone="good">
                <StatusDot tone="good" pulse /> Yamaha P-125 connected
              </Badge>
              <Badge tone="accent">Key of C major</Badge>
            </div>
            <div className="ui-stack" style={{ alignItems: 'center', gap: 'var(--space-3)', paddingBlock: 'var(--space-10)' }}>
              <Swap value={chord.symbol} className="ui-display">
                {chord.symbol}
              </Swap>
              <Swap value={chord.name}>
                <span className="ui-muted" style={{ fontSize: 'var(--text-lg)' }}>
                  {chord.name} · {chord.inv}
                </span>
              </Swap>
              <div className="ui-row" style={{ gap: 'var(--space-2)' }}>
                <Badge tone="accent">Roman {chord.roman}</Badge>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} className="ui-row" style={{ gap: 'var(--space-6)', alignItems: 'stretch' }}>
          <Card style={{ flex: '1 1 320px' }}>
            <div className="ui-stack" style={{ gap: 'var(--space-4)' }}>
              <h2 className="ui-heading">Buttons</h2>
              <div className="ui-row" style={{ gap: 'var(--space-3)' }}>
                <Button variant="primary">Connect keyboard</Button>
                <Button>Settings</Button>
                <Button variant="ghost">Skip</Button>
                <Button variant="danger">Reset</Button>
                <Button variant="primary" loading>
                  Saving
                </Button>
              </div>
              <div className="ui-row" style={{ gap: 'var(--space-3)' }}>
                <Button size="sm">Small</Button>
                <Button size="lg" variant="primary">
                  Start lesson
                </Button>
              </div>
            </div>
          </Card>
          <Card style={{ flex: '1 1 320px' }}>
            <div className="ui-stack" style={{ gap: 'var(--space-4)' }}>
              <h2 className="ui-heading">Controls</h2>
              <SegmentedControl
                label="Note names"
                value={naming}
                onChange={setNaming}
                options={[
                  { value: 'western', label: 'C D E' },
                  { value: 'sargam', label: 'Sa Re Ga' },
                  { value: 'both', label: 'Both' },
                ]}
              />
              <Select label="Key" defaultValue="C" groups={[{ label: 'Major', options: [{ value: 'C', label: 'C major' }, { value: 'G', label: 'G major' }] }, { label: 'Minor', options: [{ value: 'Am', label: 'A minor' }] }]} />
              <Switch label="Play sound for on-screen keys" checked={sound} onChange={setSound} />
              <p className="ui-muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                No keyboard? Use <Kbd>A</Kbd> <Kbd>W</Kbd> <Kbd>S</Kbd> … on your computer.
              </p>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Feedback signal={signal}>
            <Card>
              <div className="ui-row" style={{ justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <div className="ui-stack" style={{ gap: 'var(--space-1)' }}>
                  <span className="ui-eyebrow">Test feedback</span>
                  <span style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>Play F♯ anywhere</span>
                </div>
                <div className="ui-row" style={{ gap: 'var(--space-2)' }}>
                  <Button onClick={() => setSignal({ kind: 'good', id: Date.now() })}>Right</Button>
                  <Button variant="danger" onClick={() => setSignal({ kind: 'bad', id: Date.now() })}>
                    Wrong
                  </Button>
                </div>
              </div>
            </Card>
          </Feedback>
        </motion.div>

        <motion.div variants={fadeUp} className="ui-row" style={{ gap: 'var(--space-2)' }}>
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="good">Correct</Badge>
          <Badge tone="bad">Wrong</Badge>
          <Badge tone="warn">Almost</Badge>
        </motion.div>
      </motion.main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Playground />
    </ThemeProvider>
  </StrictMode>,
);
