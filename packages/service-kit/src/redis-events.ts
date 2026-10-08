import { hostname } from 'node:os';
import { Redis } from 'ioredis';
import {
  AttemptRecordedEventSchema,
  SessionEndedEventSchema,
  UserCreatedEventSchema,
  type MusicEvent,
  type MusicEventType,
} from '@music/contracts';
import type { EventBus } from './events.js';

type EventOf<T extends MusicEventType> = Extract<MusicEvent, { type: T }>;
type StreamEntry = [id: string, fields: string[] | null];

const SCHEMAS: Record<string, { parse(value: unknown): unknown } | undefined> = {
  'user.created': UserCreatedEventSchema,
  'attempt.recorded': AttemptRecordedEventSchema,
  'session.ended': SessionEndedEventSchema,
};

export interface RedisEventBusOptions {
  url: string;
  /** Consumer name inside each group. Defaults to host and process id, so restarts pick up their own pending events. */
  consumer?: string;
  /** How long one read waits for new events before checking again. */
  blockMs?: number;
  /** Events another consumer has held unacknowledged this long are taken over. */
  claimIdleMs?: number;
  /** Pause after a handler fails before the event is tried again. */
  retryDelayMs?: number;
  /** Approximate cap on each stream's length. */
  maxLen?: number;
  /** Prefix for stream names, so tests can use their own streams. Empty by default: the stream is the event type. */
  streamPrefix?: string;
  log?: (message: string, error?: unknown) => void;
}

/**
 * EventBus on Redis Streams. Each event type is a stream named after the type.
 * Each subscribing service gets its own consumer group, so every service sees
 * every event once per group, and an event is acknowledged only after the
 * handler succeeds. A failed event stays pending and is retried, so delivery
 * is at least once.
 */
export class RedisEventBus implements EventBus {
  private readonly redis: Redis;
  private readonly readers: Redis[] = [];
  private readonly loops: Promise<void>[] = [];
  private readonly consumer: string;
  private readonly blockMs: number;
  private readonly claimIdleMs: number;
  private readonly retryDelayMs: number;
  private readonly maxLen: number;
  private readonly prefix: string;
  private readonly log: (message: string, error?: unknown) => void;
  private closed = false;

  constructor(private readonly options: RedisEventBusOptions) {
    // RESP2 keeps XREADGROUP replies as [stream, entries] pairs; RESP3 flattens them.
    this.redis = new Redis(options.url, { maxRetriesPerRequest: null, protocol: 2 });
    this.consumer = options.consumer ?? `${hostname()}-${process.pid}`;
    this.blockMs = options.blockMs ?? 5000;
    this.claimIdleMs = options.claimIdleMs ?? 60_000;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.maxLen = options.maxLen ?? 10_000;
    this.prefix = options.streamPrefix ?? '';
    this.log = options.log ?? ((message, error) => console.error(`[event-bus] ${message}`, error ?? ''));
  }

  async publish(event: MusicEvent): Promise<void> {
    await this.redis.xadd(this.prefix + event.type, 'MAXLEN', '~', this.maxLen, '*', 'event', JSON.stringify(event));
  }

  async subscribe<T extends MusicEventType>(type: T, group: string, handler: (event: EventOf<T>) => Promise<void>): Promise<void> {
    if (this.closed) throw new Error('event bus is closed');
    try {
      // Start from the beginning of the stream, so a new service also sees events sent before it existed.
      await this.redis.xgroup('CREATE', this.prefix + type, group, '0', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
    // XREADGROUP BLOCK holds its connection, so each subscription reads on its own.
    const reader = this.redis.duplicate();
    this.readers.push(reader);
    this.loops.push(this.consume(reader, type, group, handler as (event: MusicEvent) => Promise<void>));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const reader of this.readers) reader.disconnect();
    await Promise.allSettled(this.loops);
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  private async consume(reader: Redis, type: MusicEventType, group: string, handler: (event: MusicEvent) => Promise<void>) {
    while (!this.closed) {
      try {
        // Retry our own unacknowledged events and take over ones a dead consumer left behind.
        // New events still flow while a failing one waits, and we only block when nothing is owed.
        const owed = [...(await this.read(reader, type, group, '0', false)), ...(await this.claim(reader, type, group))];
        const entries = [...owed, ...(await this.read(reader, type, group, '>', owed.length === 0))];
        let failed = false;
        for (const entry of entries) {
          if (this.closed) return;
          if (!(await this.handle(reader, type, group, entry, handler))) failed = true;
        }
        if (failed) await delay(this.retryDelayMs);
      } catch (error) {
        if (this.closed) return;
        this.log(`reading ${type} for ${group} failed`, error);
        await delay(this.retryDelayMs);
      }
    }
  }

  private async read(reader: Redis, type: string, group: string, from: '0' | '>', block: boolean): Promise<StreamEntry[]> {
    const stream = this.prefix + type;
    const args = ['GROUP', group, this.consumer, 'COUNT', '20', ...(block ? ['BLOCK', String(this.blockMs)] : []), 'STREAMS', stream, from];
    const result = (await reader.call('XREADGROUP', ...args)) as [string, StreamEntry[]][] | null;
    return result?.[0]?.[1] ?? [];
  }

  private async claim(reader: Redis, type: string, group: string): Promise<StreamEntry[]> {
    const result = (await reader.call('XAUTOCLAIM', this.prefix + type, group, this.consumer, String(this.claimIdleMs), '0', 'COUNT', '20')) as [string, StreamEntry[]];
    return result[1] ?? [];
  }

  /** Runs the handler for one entry. Returns false if it should be retried. */
  private async handle(reader: Redis, type: MusicEventType, group: string, [id, fields]: StreamEntry, handler: (event: MusicEvent) => Promise<void>) {
    // A trimmed entry comes back with no fields; there is nothing left to deliver.
    const raw = fields ? fieldValue(fields, 'event') : undefined;
    if (raw === undefined) {
      await reader.xack(this.prefix + type, group, id);
      return true;
    }
    let event: MusicEvent;
    try {
      const schema = SCHEMAS[type];
      if (!schema) throw new Error(`no schema for event type ${type}`);
      event = schema.parse(JSON.parse(raw)) as MusicEvent;
    } catch (error) {
      // A malformed event will never succeed; drop it rather than retry forever.
      this.log(`dropping malformed ${type} event ${id}`, error);
      await reader.xack(this.prefix + type, group, id);
      return true;
    }
    try {
      await handler(event);
    } catch (error) {
      this.log(`${group} failed to handle ${type} event ${event.id}; will retry`, error);
      return false;
    }
    await reader.xack(this.prefix + type, group, id);
    return true;
  }
}

function fieldValue(fields: string[], name: string): string | undefined {
  for (let i = 0; i < fields.length - 1; i += 2) if (fields[i] === name) return fields[i + 1];
  return undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
