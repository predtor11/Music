import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { injectConfig, resolveStatic } from '../src/static-server.js';

describe('injectConfig', () => {
  it('puts the settings at the top of <head> and escapes <', () => {
    const html = injectConfig('<html><head><title>x</title></head></html>', { supabaseUrl: 'https://a.co', supabaseAnonKey: '</script>' });
    expect(html).toContain('<head>\n    <script>window.__MUSIC_CONFIG__ = {"supabaseUrl":"https://a.co","supabaseAnonKey":"\\u003c/script>"};</script>');
  });
});

describe('resolveStatic', () => {
  const root = join('/srv', 'web');
  it('maps a path inside the web folder', () => {
    expect(resolveStatic(root, '/assets/app.js?v=1')).toBe(join(root, 'assets', 'app.js'));
  });
  it('refuses paths that leave the web folder', () => {
    expect(resolveStatic(root, '/../secret')).toBeNull();
    expect(resolveStatic(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveStatic(root, '/%E0%A4%A')).toBeNull();
  });
});
