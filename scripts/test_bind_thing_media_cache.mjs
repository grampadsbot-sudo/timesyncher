import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  IMMUTABLE_MEDIA_CACHE_CONTROL,
  ifNoneMatchSatisfied,
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

console.log('bind-thing-media cache tests passed');
