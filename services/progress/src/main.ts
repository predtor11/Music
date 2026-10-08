import { InMemoryEventBus, startService } from '@music/service-kit';
import { buildApp } from './app.js';
import { migrate, PostgresProgressRepository } from './postgres.js';
import { InMemoryProgressRepository } from './repository.js';

// Postgres when SUPABASE_DB_URL is set, otherwise memory (lost on restart).
const url = process.env.SUPABASE_DB_URL;
const repo = url ? PostgresProgressRepository.connect(url) : new InMemoryProgressRepository();
if (repo instanceof PostgresProgressRepository) await migrate(repo.sql);

// TODO: switch to the Redis bus from @music/service-kit once the platform work adds it.
const bus = new InMemoryEventBus();

await startService(await buildApp({ repo, bus }), 'progress');
