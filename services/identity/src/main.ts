import { InMemoryEventBus, startService } from '@music/service-kit';
import { buildApp } from './app.js';
import { PostgresProfileStore } from './postgres-store.js';
import { InMemoryProfileStore } from './store.js';

// Postgres when SUPABASE_DB_URL is set; otherwise profiles live in memory and
// are lost on restart, which is fine for local runs before Supabase exists.
const dbUrl = process.env.SUPABASE_DB_URL;
const store = dbUrl ? await PostgresProfileStore.connect(dbUrl) : new InMemoryProfileStore();
// TODO: swap for the Redis Streams bus once the platform work adds it.
const bus = new InMemoryEventBus();

await startService(buildApp({ store, bus }), 'identity');
