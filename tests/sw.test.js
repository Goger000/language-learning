import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]);

const listJs = dir => readdirSync(new URL(dir, root), { recursive: true })
  .filter(f => f.endsWith('.js'))
  .map(f => `${dir}${f.replaceAll('\\', '/')}`);

test('every cached asset exists', () => {
  for (const a of assets.filter(Boolean)) assert.ok(existsSync(new URL(a, root)), `missing: ${a}`);
});

test('every app script is cached for offline use', () => {
  for (const f of [...listJs('js/'), ...listJs('lang/')]) assert.ok(assets.includes(f), `not in sw.js ASSETS: ${f}`);
});
