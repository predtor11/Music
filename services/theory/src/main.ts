import { startService } from '@music/service-kit';
import { buildApp } from './app.js';

await startService(buildApp(), 'theory');
