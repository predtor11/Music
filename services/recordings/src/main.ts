import { startService } from '@music/service-kit';
import { buildApp } from './app.js';
import { PostgresRecordingStore } from './postgres-store.js';
import { InMemoryRecordingStore } from './store.js';

// Postgres when SUPABASE_DB_URL is set; otherwise recordings live in memory
// and are lost on restart, which is fine for local runs.
const dbUrl = process.env.SUPABASE_DB_URL;
const store = dbUrl ? await PostgresRecordingStore.connect(dbUrl) : new InMemoryRecordingStore();

await startService(buildApp({ store }), 'recordings');
