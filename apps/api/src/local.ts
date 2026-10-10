/** Runs the serverless backend as a plain server (npm run start -w @music/api), to try it before deploying. */
import { createServer } from 'node:http';
import '@music/service-kit';
import { createHandler } from './handler.js';
import { optionsFromEnv } from './compose.js';

const port = Number(process.env.PORT ?? 4100);
const options = { ...optionsFromEnv(), devMode: process.env.API_DEV_MODE === '1' || !(process.env.SUPABASE_URL || process.env.SUPABASE_JWT_SECRET) };
createServer(createHandler(options)).listen(port, '127.0.0.1', () => console.log(`[api] http://127.0.0.1:${port}/api/health`));
