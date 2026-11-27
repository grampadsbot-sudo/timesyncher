import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(process.argv[2] || new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = config.headers || [];
function delivered(pathname) {
  const result = {};
  for (const rule of headers) {
    if (!new RegExp(`^${rule.source}$`).test(pathname)) continue;
    for (const header of rule.headers) result[header.key.toLowerCase()] = header.value;
  }
  return result;
}
const immutable = 'public, max-age=31536000, immutable';
const revalidate = 'public, max-age=0, must-revalidate';
for (const pathname of ['/assets/index-Abcd1234.js', '/assets/index-Ab_cd-12.css', '/assets/JourneyBookPDF-XyZ12345.js']) {
  const actual = delivered(pathname);
  assert.equal(actual['cache-control'], immutable, `${pathname}: hashed asset must be immutable after all matching rules`);
  assert.equal(actual['x-frame-options'], 'DENY', pathname);
  assert.equal(actual['x-content-type-options'], 'nosniff', pathname);
  console.log(`immutable + security: ${pathname}`);
}
for (const pathname of ['/', '/index.html', '/vacation-app.html', '/api/version', '/api/vacation-app', '/assets/upstream/LICENSE', '/assets/upstream/NOTICE', '/assets/index.js', '/assets/index-short.js', '/assets/index-Abcd1234Xjs', '/assets/index-Abcd1234.js.map', '/other/index-Abcd1234.js']) {
  const actual = delivered(pathname);
  assert.equal(actual['cache-control'], revalidate, `${pathname}: unhashed or unrelated path must revalidate`);
  assert.equal(actual['x-frame-options'], 'DENY', pathname);
  assert.equal(actual['x-content-type-options'], 'nosniff', pathname);
  console.log(`revalidate + security: ${pathname}`);
}
console.log('hashed-assets immutable cache policy passed');
