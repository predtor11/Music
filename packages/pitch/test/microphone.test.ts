import { describe, expect, it, vi } from 'vitest';
import { MicrophonePitchInput, type MicrophoneEnvironment } from '../src/index.js';

function fixture() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const analyser = { fftSize: 0, disconnect: vi.fn(), getFloatTimeDomainData: vi.fn((a: Float32Array) => {
    for (let i = 0; i < a.length; i++) a[i] = 0.4 * Math.sin(2 * Math.PI * 110 * i / 48000);
  }) };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = { sampleRate: 48000, resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), createAnalyser: () => analyser, createMediaStreamSource: () => source };
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const environment: MicrophoneEnvironment = {
    getUserMedia: vi.fn().mockResolvedValue(stream),
    createContext: () => context as unknown as AudioContext,
    requestFrame: (cb) => { frames.set(++id, cb); return id; },
    cancelFrame: vi.fn((n) => { frames.delete(n); }),
  };
  const onPitch = vi.fn(); const onState = vi.fn();
  const input = new MicrophonePitchInput({ onPitch, onState }, environment);
  const tick = (time: number) => {
    const [n, cb] = [...frames][0]!; frames.delete(n); cb(time);
  };
  return { input, environment, context, stream, track, source, analyser, frames, tick, onPitch, onState };
}

describe('microphone lifecycle', () => {
  it('requests audio only on start, emits local notes, and releases resources on stop', async () => {
    const f = fixture();
    expect(f.environment.getUserMedia).not.toHaveBeenCalled();
    await f.input.start();
    expect(f.input.status).toBe('listening');
    expect(f.environment.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    f.tick(0);
    expect(f.onPitch).toHaveBeenLastCalledWith(expect.objectContaining({ midi: 45 }));
    f.tick(20);
    expect(f.analyser.getFloatTimeDomainData).toHaveBeenCalledTimes(1);
    f.tick(100);
    expect(f.analyser.getFloatTimeDomainData).toHaveBeenCalledTimes(2);
    f.input.stop();
    expect(f.frames.size).toBe(0);
    expect(f.track.stop).toHaveBeenCalledTimes(1);
    expect(f.source.disconnect).toHaveBeenCalledOnce();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.onPitch).toHaveBeenLastCalledWith(null);
    expect(f.input.status).toBe('idle');
  });

  it('stops a permission result that arrives after leaving the page', async () => {
    const f = fixture();
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(f.environment.getUserMedia).mockReturnValue(new Promise((r) => { resolve = r; }));
    const starting = f.input.start();
    await Promise.resolve();
    f.input.stop();
    resolve(f.stream); await starting;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
    expect(f.input.status).toBe('idle');
  });

  it('ignores old permission failures when a newer session starts', async () => {
    const f = fixture();
    let reject!: (error: Error) => void;
    vi.mocked(f.environment.getUserMedia).mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    const old = f.input.start(); await Promise.resolve();
    f.input.stop(); await f.input.start();
    reject(new DOMException('Denied', 'NotAllowedError')); await old;
    expect(f.input.status).toBe('listening');
    f.input.stop();
  });

  it('handles denied permission without leaving an audio context open', async () => {
    const f = fixture();
    vi.mocked(f.environment.getUserMedia).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await f.input.start();
    expect(f.input.status).toBe('denied');
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
  });

  it('cleans up when the input device disappears or audio reading fails', async () => {
    for (const failRead of [false, true]) {
      const f = fixture(); await f.input.start();
      if (failRead) {
        f.analyser.getFloatTimeDomainData.mockImplementation(() => { throw new Error('Disconnected'); });
        f.tick(0);
      } else {
        const onEnded = f.track.addEventListener.mock.calls[0]![1] as () => void;
        onEnded();
      }
      expect(f.input.status).toBe('error');
      expect(f.track.stop).toHaveBeenCalledOnce();
      expect(f.context.close).toHaveBeenCalledOnce();
      expect(f.frames.size).toBe(0);
    }
  });

  it('does not duplicate a listening session and reports unsupported browsers', async () => {
    const f = fixture(); await f.input.start(); await f.input.start();
    expect(f.environment.getUserMedia).toHaveBeenCalledOnce();
    f.input.stop();
    const unsupported = new MicrophonePitchInput({ onPitch: vi.fn() }, null);
    await unsupported.start();
    expect(unsupported.status).toBe('unsupported');
  });
});
