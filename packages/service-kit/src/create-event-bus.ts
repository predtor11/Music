import { InMemoryEventBus, type EventBus } from './events.js';
import { RedisEventBus, type RedisEventBusOptions } from './redis-events.js';

/**
 * The event bus for this process: Redis Streams when REDIS_URL is set,
 * otherwise in memory (single process only, events are lost on restart).
 */
export function createEventBus(options: Partial<RedisEventBusOptions> = {}): EventBus {
  const url = options.url ?? process.env.REDIS_URL;
  if (url) return new RedisEventBus({ ...options, url });
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[event-bus] REDIS_URL is not set; using an in-memory event bus. Events will not reach other services.');
  }
  return new InMemoryEventBus();
}
