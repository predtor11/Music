// Builds the whole site for Vercel as a Build Output (.vercel/output at the repo root):
//   static/                the web app
//   functions/api.func/    the backend (index.mjs) plus the curriculum JSON it reads
//   config.json            /api/* goes to the function; other paths fall back to index.html
// Nothing secret is built in: the sign-in settings the browser needs are public
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); the database URL and keys are
// read by the function from Vercel's environment at run time.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

execFileSync('npm', ['run', 'build', '-w', '@music/web'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
cpSync(join(root, 'apps', 'web', 'dist'), join(out, 'static'), { recursive: true });

await build({
  entryPoints: { index: join(here, 'src', 'handler.ts') },
  outdir: fn,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
  // Some dependencies still use require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(join(root, 'services', 'curriculum', 'content'), join(fn, 'content'), { recursive: true });

writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/api(?:/.*)?', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Built ${out}`);
