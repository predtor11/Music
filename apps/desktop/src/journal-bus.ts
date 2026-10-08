import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { MusicEvent } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';

/**
 * The desktop app's event bus: every service runs in one process and shares
 * it, so no Redis is needed. Without a database the services keep their data
 * in memory, so the bus also appends each event to a file and replays the file
 * at start-up. The progress service rebuilds the report from those events.
 */
export class JournalEventBus extends InMemoryEventBus {
  /** `file` is null when a database keeps the data and nothing needs replaying. */
  constructor(private readonly file: string | null) {
    super();
  }

  override async publish(event: MusicEvent): Promise<void> {
    if (this.file) appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    await super.publish(event);
  }

  /** Re-delivers the saved events to the subscribers. Returns how many. Skips lines it can't read. */
  async replay(): Promise<number> {
    if (!this.file || !existsSync(this.file)) return 0;
    let count = 0;
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let event: MusicEvent;
      try {
        event = JSON.parse(line) as MusicEvent;
      } catch {
        continue;
      }
      await super.publish(event);
      count++;
    }
    return count;
  }
}
