// Fails when two tracked files would be the same file on Windows or macOS,
// which ignore case. Script extensions are dropped first, because an import
// of './Foo.js' can resolve to foo.ts there even when Foo.tsx exists.
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const stem = (f) => f.replace(/\.(m|c)?(t|j)sx?$/, '');
const seen = new Map();
const clashes = [];
for (const f of files) {
  const key = stem(f).toLowerCase();
  const other = seen.get(key);
  if (other !== undefined && stem(other) !== stem(f)) clashes.push(`${other}  vs  ${f}`);
  else if (other === undefined) seen.set(key, f);
}
if (clashes.length) {
  console.error('These paths differ only in case, so they clash on Windows and macOS:');
  for (const c of clashes) console.error(`  ${c}`);
  process.exit(1);
}
console.log(`Checked ${files.length} paths: no case clashes.`);
