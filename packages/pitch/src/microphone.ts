import { detectPitch, type PitchOptions, type PitchReading } from './detect.js';

export type MicrophoneState = 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'error';

/** Injectable browser boundary, also used to test permission and cleanup races. */
export interface MicrophoneEnvironment {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext: () => AudioContext;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
}

export interface MicrophoneOptions extends PitchOptions {
  onPitch: (reading: PitchReading | null) => void;
  onState?: (state: MicrophoneState) => void;
}

function browserEnvironment(): MicrophoneEnvironment | null {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || !window.AudioContext) return null;
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createContext: () => new AudioContext(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
}

/** Explicit start/stop; permission is requested only from a user's Start action. */
export class MicrophonePitchInput {
  private state: MicrophoneState = 'idle';
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame: number | null = null;
  private ended: (() => void) | null = null;

  constructor(private readonly options: MicrophoneOptions, private readonly environment: MicrophoneEnvironment | null = browserEnvironment()) {}

  get status(): MicrophoneState { return this.state; }

  private setState(state: MicrophoneState) {
    this.state = state;
    this.options.onState?.(state);
  }

  async start(): Promise<void> {
    if (this.state === 'requesting' || this.state === 'listening') return;
    if (!this.environment) { this.setState('unsupported'); return; }
    const generation = ++this.generation;
    this.setState('requesting');
    try {
      // Create/resume in the user gesture, before the permission promise.
      const context = this.environment.createContext();
      this.context = context;
      await context.resume();
      if (generation !== this.generation) return;
      const stream = await this.environment.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const source = context.createMediaStreamSource(stream);
      this.source = source;
      const analyser = context.createAnalyser();
      this.analyser = analyser;
      analyser.fftSize = 4096;
      source.connect(analyser);
      // Do not connect to the speakers: that would create feedback.
      this.ended = () => {
        if (generation !== this.generation) return;
        this.release();
        ++this.generation;
        this.options.onPitch(null);
        this.setState('error');
      };
      stream.getTracks().forEach((track) => track.addEventListener('ended', this.ended!));
      this.setState('listening');
      const samples = new Float32Array(analyser.fftSize);
      let previous = -Infinity;
      const tick: FrameRequestCallback = (time) => {
        if (generation !== this.generation) return;
        try {
          if (time - previous >= 80) {
            previous = time;
            analyser.getFloatTimeDomainData(samples);
            this.options.onPitch(detectPitch(samples, context.sampleRate, this.options));
          }
          this.frame = this.environment!.requestFrame(tick);
        } catch {
          this.ended?.();
        }
      };
      this.frame = this.environment.requestFrame(tick);
    } catch (error) {
      if (generation !== this.generation) return;
      this.release();
      this.options.onPitch(null);
      const name = error instanceof Error ? error.name : '';
      this.setState(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error');
    }
  }

  private release(): void {
    if (this.frame !== null) this.environment?.cancelFrame(this.frame);
    this.frame = null;
    if (this.ended) this.stream?.getTracks().forEach((track) => track.removeEventListener('ended', this.ended!));
    this.ended = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }

  stop(): void {
    ++this.generation;
    this.release();
    this.options.onPitch(null);
    this.setState('idle');
  }
}
