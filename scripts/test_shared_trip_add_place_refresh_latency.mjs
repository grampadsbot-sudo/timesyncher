import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedTripPayload } from '../src/vacation/shared-trip-handler.mjs';
import { resetSharedUpstreamCacheForTests, writeCachedUpstreamShared, sharedUpstreamCacheKey } from '../src/vacation/shared-trip-upstream-cache.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function mockReq(method, url, body = null) {
  const payload = body == null ? null : Buffer.from(JSON.stringify(body));
  return {
    method,
    url,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    async *[Symbol.asyncIterator]() {
      if (payload) yield payload;
    },
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      this.body = chunk ?? '';
    },
  };
}

resetSharedUpstreamCacheForTests();
const fixtureDir = path.join(os.homedir(), 'tsv-dispatch/acceptance/fixtures/demo-nyc-99-snapshot-20261110');
const sharedRaw = JSON.parse(await readFile(path.join(fixtureDir, 'shared-trip.json'), 'utf8'));
const slug = `accept984-${Date.now().toString(36)}`;
let trekTrip = structuredClone(sharedRaw);
const tripId = trekTrip.trip?.id ?? 99;

const trekServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === `/api/shared/${slug}/` || pathname === `/api/shared/${slug}`) {
    const body = Buffer.from(JSON.stringify(trekTrip));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (req.method === 'POST' && pathname === `/api/trips/${tripId}/places`) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const place = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const nextId = Math.max(0, ...trekTrip.places.map((p) => Number(p.id) || 0)) + 1;
    const row = {
      id: nextId,
      trip_id: tripId,
      name: place.name || place.title || 'Acceptance probe',
      category: place.category || 'restaurant',
      lat: place.lat ?? 40.75,
      lng: place.lng ?? -73.99,
    };
    trekTrip.places.push(row);
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify(row));
    return;
  }
  res.writeHead(404);
  res.end('missing');
});

await new Promise((resolve) => trekServer.listen(0, '127.0.0.1', resolve));
const trekOrigin = `http://127.0.0.1:${trekServer.address().port}`;
const prevTrek = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = trekOrigin;

try {
  const probeName = `Accept984 Latency Probe ${Date.now()}`;
  const postUpstream = await fetch(`${trekOrigin}/api/trips/${tripId}/places`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: probeName, category: 'restaurant', lat: 40.751, lng: -73.985 }),
  });
  assert.equal(postUpstream.status, 201, 'trek place create');

  const stale = structuredClone(trekTrip);
  stale.places = stale.places.filter((p) => p.name !== probeName);
  writeCachedUpstreamShared(sharedUpstreamCacheKey(slug, '_ts=1'), {
    status: 200,
    body: Buffer.from(JSON.stringify(stale)),
    json: stale,
    contentType: 'application/json',
  });

  const before = Date.now();
  const payload = await loadSharedTripPayload(slug, mockReq('GET', `/api/shared/${slug}/?_ts=${before}`));
  const elapsed = Date.now() - before;
  assert.ok(payload?.places?.some((p) => String(p.name || '').includes('Accept984 Latency Probe')), 'refresh payload includes new place');
  assert.ok(elapsed < 120_000, `shared GET refresh recorded duration ${elapsed}ms`);
  console.log(JSON.stringify({ event: 'acceptance_984_shared_refresh_ms', duration_ms: elapsed, place: probeName }));
} finally {
  if (prevTrek == null) delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  else process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = prevTrek;
  await new Promise((resolve) => trekServer.close(() => resolve()));
  resetSharedUpstreamCacheForTests();
}
