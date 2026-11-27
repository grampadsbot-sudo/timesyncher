import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const headers = [
  {
    "source": "/(.*)",
    "headers": [
      {
        "key": "Cache-Control",
        "value": "public, max-age=0, must-revalidate"
      },
      {
        "key": "X-Content-Type-Options",
        "value": "nosniff"
      },
      {
        "key": "X-Frame-Options",
        "value": "DENY"
      }
    ]
  },
  {
    "source": "/assets/(.*-[A-Za-z0-9_-]{8,}\\.(?:js|css))",
    "headers": [
      {
        "key": "Cache-Control",
        "value": "public, max-age=31536000, immutable"
      }
    ]
  }
];
const dir = await mkdtemp(join(tmpdir(), 'cache-checker-contract-'));
const checker = new URL('./test_1014_hashed_assets_cache_headers.mjs', import.meta.url);
async function check(name, rules, pass) {
  const path = join(dir, `${name}.json`);
  await writeFile(path, JSON.stringify({ headers: rules }));
  const result = spawnSync(process.execPath, [checker.pathname, path], { encoding: 'utf8' });
  assert.equal(result.error, undefined, name);
  assert.equal(result.status === 0, pass, `${name}: ${result.stdout} ${result.stderr}`);
  console.log(`${name}: ${pass ? 'accepted' : 'rejected'}`);
}
try {
  await check('proposed-policy', headers, true);
  await check('missing-cache-rule', headers.filter(rule => !rule.source.startsWith('/assets/')), false);
  const noSecurity = structuredClone(headers);
  for (const rule of noSecurity) rule.headers = rule.headers.filter(h => h.key.toLowerCase() !== 'x-frame-options');
  await check('missing-security-header', noSecurity, false);
  await check('broad-immutable-override', [...headers, { source: '/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }], false);
  console.log('cache checker source contract passed (1 positive, 3 negative)');
} finally {
  await rm(dir, { recursive: true, force: true });
}
