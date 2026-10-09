// Builds the desktop app into dist/:
//   main.cjs      the window process (Electron)
//   server/       every service plus the web server, bundled (server.mjs)
//   web/          the built web app
//   services/<name>/{content,migrations}  files the services read at run time
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, 'dist');
const servicesDir = join(root, 'services');

rmSync(out, { recursive: true, force: true });

// The installer must not carry anyone's Supabase settings: the app reads
// them from its own settings file at run time instead.
execFileSync('npm', ['run', 'build', '-w', '@music/web'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
cpSync(join(root, 'apps', 'web', 'dist'), join(out, 'web'), { recursive: true });

for (const name of ['curriculum', 'identity', 'practice', 'progress']) {
  for (const sub of ['content', 'migrations']) {
    const from = join(servicesDir, name, sub);
    if (existsSync(from)) cpSync(from, join(out, 'services', name, sub), { recursive: true });
  }
}

// Services find their content and migrations with new URL('../x', import.meta.url).
// In the bundle import.meta.url is the bundle itself, so point it back at
// dist/services/<name>/src/ where those folders sit one level up.
const serviceFileUrls = {
  name: 'service-file-urls',
  setup(b) {
    b.onLoad({ filter: /[\\/]services[\\/][^\\/]+[\\/]src[\\/].*\.ts$/ }, async (args) => {
      const { readFile } = await import('node:fs/promises');
      const rel = relative(servicesDir, args.path).split(sep);
      const source = await readFile(args.path, 'utf8');
      if (!source.includes('import.meta.url')) return undefined;
      return { contents: source.replaceAll('import.meta.url', `__musicServiceUrl(${JSON.stringify(rel[0])})`), loader: 'ts' };
    });
  },
};

await build({
  entryPoints: { server: join(here, 'src', 'server.ts') },
  outdir: join(out, 'server'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: 'linked',
  logLevel: 'warning',
  plugins: [serviceFileUrls],
  banner: {
    js: [
      "import { createRequire as __musicCreateRequire } from 'node:module';",
      "import { join as __musicJoin } from 'node:path';",
      "import { pathToFileURL as __musicPathToFileURL } from 'node:url';",
      'const require = __musicCreateRequire(import.meta.url);',
      'const __musicServiceUrl = (name) => __musicPathToFileURL(__musicJoin(process.env.MUSIC_APP_ROOT, "services", name, "src", "index.js")).href;',
    ].join('\n'),
  },
});

await build({
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(out, 'main.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
});

console.log(`Built the desktop app into ${relative(root, out)}`);
