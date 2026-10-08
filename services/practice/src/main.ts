import { InMemoryEventBus, startService } from '@music/service-kit';
import { buildApp } from './app.js';
import { HttpCurriculumClient } from './curriculum-client.js';
import { InMemoryPracticeRepository, type PracticeRepository } from './repository.js';

// Postgres when SUPABASE_DB_URL is set, otherwise in memory (data is lost on restart).
let repo: PracticeRepository;
const dbUrl = process.env.SUPABASE_DB_URL;
if (dbUrl) {
  const { PostgresPracticeRepository } = await import('./postgres.js');
  repo = await PostgresPracticeRepository.connect(dbUrl);
} else {
  repo = new InMemoryPracticeRepository();
}

// TODO: switch to the Redis bus once service-kit has one.
const bus = new InMemoryEventBus();

await startService(buildApp({ repo, bus, curriculum: new HttpCurriculumClient() }), 'practice');
