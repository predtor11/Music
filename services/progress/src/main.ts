import { createEventBus, startService } from '@music/service-kit';
import { buildApp } from './app.js';
import { migrate, PostgresProgressRepository } from './postgres.js';
import { InMemoryProgressRepository } from './repository.js';

// Postgres when SUPABASE_DB_URL is set, otherwise memory (lost on restart).
const url = process.env.SUPABASE_DB_URL;
const repo = url ? PostgresProgressRepository.connect(url) : new InMemoryProgressRepository();
if (repo instanceof PostgresProgressRepository) await migrate(repo.sql);

// Redis Streams when REDIS_URL is set, otherwise in memory.
const bus = createEventBus();

await startService(await buildApp({ repo, bus }), 'progress');
