/**
 * Pieces: songs to learn, a bit at a time. Starter pieces come with the app;
 * open any MIDI file (.mid) to add your own. Imported pieces stay in this
 * browser and are never uploaded.
 */

import { Badge, Button, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useRef, useState, type DragEvent } from 'react';
import { analyse } from '../pieces/analyse.js';
import { barCount, pieceFromMidiBytes, type Piece } from '../pieces/piece.js';
import { STARTER_PIECES } from '../pieces/starter.js';
import { importedPieces, removeImported, saveImported } from '../pieces/storage.js';
import { href } from '../router.js';
import { keyLabel, pretty } from '@music/theory';
import l from '../lesson/lesson.module.css';
import s from '../pieces/pieces.module.css';

/** The hand sessions that train what hard pieces ask of the hands. */
export const PIECE_DRILLS = [
  { id: 'h10', title: 'Left-hand octaves' },
  { id: 'h11', title: 'Bass note, then chord' },
  { id: 'h12', title: 'Broken chords in the left hand' },
  { id: 'h13', title: 'Leaps to a far key' },
];

const MAX_FILE_BYTES = 2_000_000;

function PieceCard({ piece, onRemove }: { piece: Piece; onRemove?: () => void }) {
  const key = analyse(piece).key.key;
  return (
    <motion.div variants={fadeUp}>
      <a className={s.pieceLink} href={href.piece(piece.id)} data-testid={`piece-${piece.id}`}>
        <Card interactive padding="md" className={s.pieceCard}>
          <div className={s.pieceTop}>
            <span>
              <span className={s.pieceTitle}>{piece.title}</span>
              {piece.composer && <span className={`ui-muted ${l.small}`}> · {piece.composer}</span>}
            </span>
            <Badge tone={piece.source === 'starter' ? 'accent' : 'neutral'}>{piece.source === 'starter' ? 'Starter' : 'Yours'}</Badge>
          </div>
          {piece.about && <span className={`ui-muted ${l.small}`}>{piece.about}</span>}
          <div className={s.row}>
            <Badge tone="neutral">{pretty(keyLabel(key))}</Badge>
            <Badge tone="neutral">{barCount(piece)} bars</Badge>
            {onRemove && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  onRemove();
                }}
                data-testid="remove-piece"
              >
                Remove
              </Button>
            )}
          </div>
        </Card>
      </a>
    </motion.div>
  );
}

export function PiecesPage() {
  const [mine, setMine] = useState(importedPieces);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const open = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too big for a piano piece. Pick a .mid file under 2 MB.');
      return;
    }
    try {
      const piece = pieceFromMidiBytes(await file.arrayBuffer(), file.name, `import-${Date.now().toString(36)}`);
      if (!saveImported(piece)) setError("This browser wouldn't save the piece, so it will be gone after a reload. You can still practise it now.");
      location.hash = href.piece(piece.id);
    } catch (e) {
      setError(`Couldn't open ${file.name}: ${(e as Error).message}`);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void open(file);
  };

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className={s.page}>
      <motion.div variants={fadeUp}>
        <span className="ui-eyebrow">Pieces</span>
        <h1 className="ui-title">Learn a piece, a bit at a time</h1>
        <p className={`ui-muted ${l.small}`}>
          Open a piece to see its key, its chords bar by bar and its melody before you play a note. Then practise one hand and a few bars at a time: the app waits for you, or keeps time
          and speeds up as you get it clean.
        </p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card
          padding="md"
          className={`${s.importCard} ${s.drop}`}
          data-over={over || undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          data-testid="import"
        >
          <div className={s.between}>
            <div>
              <h2 className="ui-heading">Open your own piece</h2>
              <span className={`ui-muted ${l.small}`}>
                Any MIDI file (.mid). Drop it here or pick it. It stays in this browser. Free MIDI files of old, public-domain pieces (Moonlight Sonata, La Campanella and more) are at{' '}
                <a href="https://www.mutopiaproject.org" target="_blank" rel="noreferrer">
                  the Mutopia Project
                </a>
                .
              </span>
            </div>
            <Button variant="primary" onClick={() => fileInput.current?.click()} data-testid="import-button">
              Open a MIDI file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".mid,.midi,audio/midi,audio/x-midi"
              hidden
              data-testid="import-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void open(file);
              }}
            />
          </div>
          {error && (
            <span className={l.small} style={{ color: 'var(--bad)' }} data-testid="import-error">
              {error}
            </span>
          )}
        </Card>
      </motion.div>

      {mine.length > 0 && (
        <motion.section variants={fadeUp} className={s.page}>
          <h2 className="ui-heading">Your pieces</h2>
          <motion.div className={s.grid} variants={stagger(0.03)}>
            {mine.map((p) => (
              <PieceCard
                key={p.id}
                piece={p}
                onRemove={() => {
                  removeImported(p.id);
                  setMine(importedPieces());
                }}
              />
            ))}
          </motion.div>
        </motion.section>
      )}

      <motion.section variants={fadeUp} className={s.page}>
        <h2 className="ui-heading">Starter pieces</h2>
        <motion.div className={s.grid} variants={stagger(0.03)}>
          {STARTER_PIECES.map((p) => (
            <PieceCard key={p.id} piece={p} />
          ))}
        </motion.div>
      </motion.section>

      <motion.section variants={fadeUp} className={s.page}>
        <div>
          <h2 className="ui-heading">Drills for hard pieces</h2>
          <span className={`ui-muted ${l.small}`}>Short hand sessions for what hard pieces ask: a quick left hand, jumps, and leaps. The hand on screen shows every finger.</span>
        </div>
        <div className={s.row}>
          {PIECE_DRILLS.map((d) => (
            <Button key={d.id} variant="secondary" size="sm" onClick={() => (location.hash = href.hand(d.id))} data-testid={`drill-${d.id}`}>
              {d.title}
            </Button>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
