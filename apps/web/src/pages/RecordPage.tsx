/**
 * Record: play anything on your keyboard, and the app tells you what you
 * played (the key, the chords as names, numbers and sargam, in plain words).
 * Play it back, fix a chord it got wrong, export it as a MIDI file, or import
 * one. Saved recordings are listed underneath.
 */

import type { ChordCorrection, Recording, Take, UserSettings } from '@music/contracts';
import { Badge, Button, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNoteInput } from '../input/NoteInput.js';
import { TakeRecorder } from '../record/recorder.js';
import { useRecordingList, useRecordingStore, type RecordingStore } from '../record/store.js';
import { formatTime, midiToTake } from '../record/take.js';
import { TakeView } from '../record/TakeView.js';
import { href } from '../router.js';
import { Loading } from './states.js';
import s from '../record/record.module.css';

interface Draft {
  take: Take;
  title: string;
  source: 'played' | 'imported';
  keyOverride: string | null;
  corrections: ChordCorrection[];
}

const defaultTitle = () => `Recording ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

/** The record button, the live clock and note count, and MIDI file import. */
function Recorder({ onTake }: { onTake: (draft: Draft) => void }) {
  const { onPlayEvent } = useNoteInput();
  const recorder = useRef<TakeRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const file = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onPlayEvent((e, at) => {
        const r = recorder.current;
        if (!r) return;
        if (e.type === 'on') r.noteOn(e.note, e.velocity, at);
        else if (e.type === 'off') r.noteOff(e.note, at);
        else r.sustain(e.down, at);
        setNotes(r.noteCount);
      }),
    [onPlayEvent],
  );

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(performance.now() - startedAt.current), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const toggle = () => {
    setError(null);
    if (!recording) {
      startedAt.current = performance.now();
      recorder.current = new TakeRecorder(startedAt.current);
      setElapsed(0);
      setNotes(0);
      setRecording(true);
      return;
    }
    const take = recorder.current!.stop(performance.now());
    recorder.current = null;
    setRecording(false);
    if (take.notes.length === 0) return setError('Nothing was played. Press record, play something, then press stop.');
    onTake({ take, title: defaultTitle(), source: 'played', keyOverride: null, corrections: [] });
  };

  const importFile = async (f: File) => {
    setError(null);
    try {
      const { take, title } = midiToTake(new Uint8Array(await f.arrayBuffer()));
      onTake({ take, title: title || f.name.replace(/\.(mid|midi|kar)$/i, ''), source: 'imported', keyOverride: null, corrections: [] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card padding="lg" className={s.recorder}>
      <button
        type="button"
        className={s.recButton}
        data-recording={recording}
        onClick={toggle}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        data-testid="rec-toggle"
      >
        <span className={s.recDot} aria-hidden />
      </button>
      <div className={s.recInfo}>
        <span className="ui-eyebrow">{recording ? 'Recording' : 'Ready'}</span>
        <span className={s.recClock} data-testid="rec-clock">
          {formatTime(elapsed)}
        </span>
        <span className="ui-muted" data-testid="rec-notes">
          {recording ? `${notes} note${notes === 1 ? '' : 's'}` : 'Press the red button, then play. Press it again to stop.'}
        </span>
      </div>
      <div className={s.recTools}>
        <input
          ref={file}
          className={s.hiddenInput}
          type="file"
          accept=".mid,.midi,.kar,audio/midi"
          data-testid="rec-import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <Button variant="secondary" disabled={recording} onClick={() => file.current?.click()} data-testid="rec-import">
          Import a MIDI file
        </Button>
      </div>
      {error && (
        <p className={s.error} role="alert" data-testid="rec-error">
          {error}
        </p>
      )}
    </Card>
  );
}

function SavedList({ store }: { store: RecordingStore | null }) {
  const state = useRecordingList(store);
  return (
    <Card padding="md">
      <div className={s.sectionHead}>
        <span className="ui-eyebrow">Your recordings</span>
        {store && <span className="ui-muted">{store.where === 'account' ? 'Kept in your account.' : 'Kept in this browser. Sign in to keep them in your account.'}</span>}
      </div>
      {state.status === 'loading' && <p className="ui-muted">Loading…</p>}
      {state.status === 'error' && <p className="ui-muted">Couldn't load your recordings: {state.message}</p>}
      {state.status === 'ready' && state.list.length === 0 && <p className="ui-muted">Nothing saved yet. Record something and press Save.</p>}
      {state.status === 'ready' && state.list.length > 0 && (
        <ul className={s.list} data-testid="rec-list">
          {state.list.map((r) => (
            <li key={r.id}>
              <a className={s.item} href={href.recording(r.id)} data-testid="rec-item">
                <span className={s.itemGrow}>
                  <span className={s.itemTitle}>{r.title}</span>
                  <span className={`ui-muted ${s.itemMeta}`}>
                    {new Date(r.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {formatTime(r.durationMs)} ·{' '}
                    {r.noteCount} notes
                  </span>
                </span>
                {r.source === 'imported' && <Badge tone="neutral">Imported</Badge>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecordPage({ settings }: { settings: UserSettings }) {
  const store = useRecordingStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d)), []);

  const save = async () => {
    if (!draft || !store) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await store.create({ title: draft.title.trim() || defaultTitle(), source: draft.source, take: draft.take, keyOverride: draft.keyOverride, corrections: draft.corrections });
      location.hash = href.recording(saved.id);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={s.pageHead} variants={fadeUp}>
        <span className="ui-eyebrow">Record and understand</span>
        <h1 className="ui-title">Record</h1>
        <p className="ui-muted">
          Play anything, the way you always do. The app tells you the key you were in and the chords you played, as names and as numbers, so you
          can talk about it with your band. Export it as a MIDI file for any music program.
        </p>
      </motion.div>
      <motion.div variants={fadeUp}>
        <Recorder
          onTake={(d) => {
            setError(null);
            setDraft(d);
          }}
        />
      </motion.div>
      {draft && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className={s.take} data-testid="rec-draft">
          <Card padding="md" className={s.saveRow}>
            <label className="ui-field">
              <span className="ui-field-label">Name</span>
              <input className={s.titleInput} value={draft.title} maxLength={120} onChange={(e) => patch({ title: e.target.value })} data-testid="rec-title" />
            </label>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!store} data-testid="rec-save">
              Save
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} data-testid="rec-discard">
              Discard
            </Button>
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
          </Card>
          <TakeView
            take={draft.take}
            title={draft.title}
            keyOverride={draft.keyOverride}
            corrections={draft.corrections}
            naming={settings.noteNaming}
            onKey={(keyOverride) => patch({ keyOverride })}
            onCorrections={(corrections) => patch({ corrections })}
          />
        </motion.div>
      )}
      <motion.div variants={fadeUp}>
        <SavedList store={store} />
      </motion.div>
    </motion.div>
  );
}

/** One saved recording. Key and chord fixes are saved as you make them. */
export function RecordingPage({ id, settings }: { id: string; settings: UserSettings }) {
  const store = useRecordingStore();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; recording: Recording }>({
    status: 'loading',
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    let live = true;
    store.get(id).then(
      (recording) => live && setState(recording ? { status: 'ready', recording } : { status: 'missing' }),
      (err: Error) => live && setState({ status: 'error', message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [store, id]);

  if (state.status === 'loading') return <Loading />;
  if (state.status !== 'ready') {
    return (
      <Card padding="lg" data-testid="recording-missing">
        <h1 className="ui-title">{state.status === 'missing' ? 'Recording not found' : "Couldn't load this recording"}</h1>
        <p className="ui-muted">{state.status === 'missing' ? 'It may have been deleted, or saved in another browser.' : state.message}</p>
        <Button variant="primary" onClick={() => (location.hash = href.record)}>
          Your recordings
        </Button>
      </Card>
    );
  }

  const r = state.recording;
  const update = (p: Partial<Pick<Recording, 'title' | 'keyOverride' | 'corrections'>>) => {
    setState({ status: 'ready', recording: { ...r, ...p } });
    setSaveError(null);
    store?.update(r.id, p).catch((err: Error) => setSaveError(`Couldn't save that change: ${err.message}`));
  };
  const remove = async () => {
    if (!store || !confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    await store.remove(r.id);
    location.hash = href.record;
  };

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={s.pageHead} variants={fadeUp}>
        <a className="ui-eyebrow" href={href.record}>
          ← All recordings
        </a>
        <input
          className={`ui-title ${s.titleInput}`}
          aria-label="Name"
          defaultValue={r.title}
          maxLength={120}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== r.title) update({ title });
          }}
          data-testid="recording-title"
        />
        {saveError && (
          <p className={s.error} role="alert">
            {saveError}
          </p>
        )}
      </motion.div>
      <TakeView
        take={r.take}
        title={r.title}
        keyOverride={r.keyOverride}
        corrections={r.corrections}
        naming={settings.noteNaming}
        onKey={(keyOverride) => update({ keyOverride })}
        onCorrections={(corrections) => update({ corrections })}
        actions={
          <Button variant="ghost" onClick={() => void remove()} data-testid="recording-delete">
            Delete
          </Button>
        }
      />
    </motion.div>
  );
}
