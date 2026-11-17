import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  IMMUTABLE_MEDIA_CACHE_CONTROL,
  ifNoneMatchSatisfied,
  parseByteRange,
  sendCachedBindingMedia,
  strongContentEtag,
} from '../src/vacation/bind-thing-media-cache.mjs';
import { sendJson } from '../src/vacation/http.mjs';

const bytes = Buffer.from('bind-thing-media-cache-fixture');

assert.equal(
  strongContentEtag(bytes),
  `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`,
);

const etag = strongContentEtag(bytes);
assert.equal(ifNoneMatchSatisfied(etag, etag), true);
assert.equal(ifNoneMatchSatisfied(`W/${etag}`, etag), true);
assert.equal(ifNoneMatchSatisfied('*', etag), true);
assert.equal(ifNoneMatchSatisfied('"other"', etag), false);

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.getHeader = (key) => res.headers[String(key).toLowerCase()];
  res.end = (body) => {
    res.body = body;
  };
  return res;
}

{
  const res = mockRes();
  const req = { headers: {} };
  const out = sendCachedBindingMedia(res, req, {
    bytes,
    mimeType: 'image/png',
    originalName: 'venue.png',
  });
  assert.equal(out.statusCode, 200);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], IMMUTABLE_MEDIA_CACHE_CONTROL);
  assert.equal(res.headers.etag, etag);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.match(res.headers['content-disposition'], /venue\.png/);
  assert.deepEqual(res.body, bytes);
}

{
  const res = mockRes();
  const req = { headers: { 'if-none-match': etag } };
  const out = sendCachedBindingMedia(res, req, {
    bytes,
    mimeType: 'image/png',
    originalName: 'venue.png',
  });
  assert.equal(out.statusCode, 304);
  assert.equal(res.statusCode, 304);
  assert.equal(res.headers['cache-control'], IMMUTABLE_MEDIA_CACHE_CONTROL);
  assert.equal(res.headers.etag, etag);
  assert.equal(res.body, '');
}

for (const status of [404, 500]) {
  const res = mockRes();
  sendJson(res, status, { ok: false, error: 'test' });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.notEqual(res.headers['cache-control'], IMMUTABLE_MEDIA_CACHE_CONTROL);
}

assert.deepEqual(parseByteRange('bytes=0-1', 100), { start: 0, end: 1 });
assert.deepEqual(parseByteRange('bytes=10-', 100), { start: 10, end: 99 });
assert.deepEqual(parseByteRange('bytes=-4', 100), { start: 96, end: 99 });

{
  const res = mockRes();
  const req = { method: 'GET', headers: { range: 'bytes=0-1' } };
  const out = sendCachedBindingMedia(res, req, {
    bytes,
    mimeType: 'video/mp4',
    originalName: 'clip.mp4',
  });
  assert.equal(out.statusCode, 206);
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['accept-ranges'], 'bytes');
  assert.equal(res.headers['content-type'], 'video/mp4');
  assert.equal(res.headers['content-range'], `bytes 0-1/${bytes.length}`);
  assert.equal(res.body.length, 2);
}

{
  const res = mockRes();
  const req = { method: 'HEAD', headers: {} };
  const out = sendCachedBindingMedia(res, req, {
    bytes,
    mimeType: 'video/mp4',
    originalName: 'clip.mp4',
  }, { headOnly: true });
  assert.equal(out.statusCode, 200);
  assert.equal(res.headers['content-length'], String(bytes.length));
  assert.equal(res.body, '');
}

console.log('bind-thing-media cache tests passed');
