/** Applies every service's SQL migrations to SUPABASE_DB_URL. Run once per deploy, not per request. */
import '@music/service-kit';
import postgres from 'postgres';
import { migrate as migrateIdentity } from '../../../services/identity/src/postgres-store.js';
import { migrate as migratePractice } from '../../../services/practice/src/postgres.js';
import { migrate as migrateProgress } from '../../../services/progress/src/postgres.js';
import { migrate as migrateRecordings } from '../../../services/recordings/src/postgres-store.js';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set.');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  for (const [name, run] of [
    ['identity', migrateIdentity],
    ['practice', migratePractice],
    ['progress', migrateProgress],
    ['recordings', migrateRecordings],
  ] as const) {
    const applied = await run(sql);
    console.log(`${name}: ${Array.isArray(applied) && applied.length ? `applied ${applied.join(', ')}` : 'up to date'}`);
  }
} finally {
  await sql.end();
}
