import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import handler from '../api/[...route].mjs';

const apiFiles = (await readdir(new URL('../api/', import.meta.url))).filter((name) => name.endsWith('.mjs'));
assert.deepEqual(apiFiles, ['[...route].mjs']);

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: '',
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload || ''); },
  };
}

const version = mockRes();
await handler({ method: 'GET', url: '/api/version', headers: {}, query: { route: ['version'] } }, version);
assert.equal(version.statusCode, 200);
assert.match(version.body, /"ok":true/);

const versionQueryOnly = mockRes();
await handler({ method: 'GET', url: '/', headers: {}, query: { route: ['version'] } }, versionQueryOnly);
assert.equal(versionQueryOnly.statusCode, 200);

const missing = mockRes();
await handler({ method: 'GET', url: '/api/not-a-route', headers: {}, query: { route: ['not-a-route'] } }, missing);
assert.equal(missing.statusCode, 404);

const stripe = mockRes();
await handler({ method: 'GET', url: '/api/stripe-webhook', headers: {}, query: { route: ['stripe-webhook'] } }, stripe);
assert.equal(stripe.statusCode, 405);

console.log('api route bundle ok');
