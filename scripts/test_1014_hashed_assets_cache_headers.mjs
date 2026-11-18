#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const headerRules = vercel.headers || [];
const assetRule = headerRules.find((rule) => rule.source === '/assets/(.*)');
assert.ok(assetRule, 'vercel.json must include a /assets/(.*) Cache-Control header rule');
const assetCache = assetRule.headers?.find((row) => row.key === 'Cache-Control')?.value || '';
assert.match(assetCache, /immutable/i);
assert.match(assetCache, /max-age=31536000/);

const catchAll = headerRules.find((rule) => rule.source === '/(.*)');
assert.ok(catchAll, 'vercel.json must keep the default /(.*) header rule');
const defaultCache = catchAll.headers?.find((row) => row.key === 'Cache-Control')?.value || '';
assert.match(defaultCache, /must-revalidate/);
assert.doesNotMatch(defaultCache, /immutable/);

const harnessAssetHeaders = (pathname, policy) => {
  if (!/^\/assets\/index-[A-Za-z0-9_-]+\.(js|css|mjs)$/i.test(pathname)) return null;
  return policy;
};
assert.equal(
  harnessAssetHeaders('/assets/index-BKun7ofk.js', assetCache),
  assetCache,
  'hashed bundle paths should use the immutable assets policy',
);
assert.equal(
  harnessAssetHeaders('/vacation-app.html', defaultCache),
  null,
  'unhashed HTML must not use the hashed-assets policy helper',
);
assert.equal(
  harnessAssetHeaders('/api/shared/copy-slug/', defaultCache),
  null,
  'API paths must not use the hashed-assets policy helper',
);

console.log('test_1014_hashed_assets_cache_headers: ok', root);