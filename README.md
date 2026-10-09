# Music Theory Trainer

Learn music theory at your own pace with a MIDI keyboard. Plug in your
keyboard, work through short lessons from note names to chord progressions,
and get tested on the real keys: the app tells you the moment you play a wrong
note and why.

## Status

Phase 1 (foundation) in progress: the theory engine and MIDI input are done;
the Chord Namer screen and the services are being built.

## Desktop app

A Windows installer that needs nothing else installed: see [docs/DESKTOP.md](docs/DESKTOP.md).

## Requirements

- Node.js 22 (20.19 or newer works)
- Chrome or Edge (they support Web MIDI)
- Docker Desktop, for Redis and local Supabase

## Quick start

```bash
npm install
npm test
npm run dev
```

Then open http://localhost:5173.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is laid out.
