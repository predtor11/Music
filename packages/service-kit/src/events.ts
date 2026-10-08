import type { MusicEvent, MusicEventType } from '@music/contracts';

type EventOf<T extends MusicEventType> = Extract<MusicEvent, { type: T }>;

/**
 * Publish and subscribe between services. Production uses Redis Streams
 * (RedisEventBus); tests and single-process runs
 * use InMemoryEventBus. Handlers must cope with the same event twice.
 */
export interface EventBus {
  publish(event: MusicEvent): Promise<void>;
  /** `group` is the consumer group, normally the subscribing service's name. */
  subscribe<T extends MusicEventType>(type: T, group: string, handler: (event: EventOf<T>) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(event: MusicEvent) => Promise<void>>>();
  readonly published: MusicEvent[] = [];

  async publish(event: MusicEvent): Promise<void> {
    this.published.push(event);
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event);
  }

  async subscribe<T extends MusicEventType>(type: T, _group: string, handler: (event: EventOf<T>) => Promise<void>): Promise<void> {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (event: MusicEvent) => Promise<void>);
    this.handlers.set(type, list);
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }
}
