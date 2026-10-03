#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  collectBindThingMediaRawCandidates,
  pickFirstOkBindThingMediaUrl,
  runBindThingMediaCacheCheck,
} from './shepherd-staging-smoke-bind-thing-media-cache.mjs';

const base = 'https://vacation-staging.timesyncher.com';
const candidates = collectBindThingMediaRawCandidates({
  base,
  shareToken: 'trip-slug',
  sharedJson: {
    media: [{ id: 'dead', publicUrl: `${base}/api/bind-thing-media?shareToken=trip-slug&id=dead&raw=1` }],
    places: [{ image_url: `${base}/api/bind-thing-media?shareToken=trip-slug&id=live&raw=1` }],
  },
  bindings: [{ id: 'bind-1', publicUrl: `${base}/api/bind-thing-media?shareToken=trip-slug&id=bind-1&raw=1` }],
});
assert.ok(candidates.length >= 2);

const fetchImpl = async (url) => {
  if (String(url).includes('id=live')) {
    return {
      status: 200,
      url,
      headers: {
        get: (name) => {
          if (name === 'cache-control') return 'public, max-age=31536000, s-maxage=31536000, immutable';
          if (name === 'etag') return '"abc"';
          return '';
        },
      },
    };
  }
  return { status: 404, url, headers: { get: () => '' } };
};

const picked = await pickFirstOkBindThingMediaUrl(candidates, fetchImpl);
assert.equal(picked.ok, true);
assert.match(picked.url, /id=live/);

const miss = await runBindThingMediaCacheCheck({
  BASE: base,
  prep: { shareSlug: 'trip-slug', sharedApi: { json: { media: [] } } },
  fetchImpl: async () => ({ status: 404, headers: { get: () => '' } }),
});
assert.equal(miss.pass, false);
assert.equal(miss.check208.failReason, 'no_bind_thing_media_raw_candidates');

const ok = await runBindThingMediaCacheCheck({
  BASE: base,
  prep: {
    shareSlug: 'trip-slug',
    sharedApi: { json: { places: [{ image_url: `${base}/api/bind-thing-media?shareToken=trip-slug&id=live&raw=1` }] } },
  },
  fetchImpl: async (url, init) => {
    if (init?.headers?.['if-none-match']) {
      return { status: 304, url, headers: { get: () => '' } };
    }
    return {
      status: 200,
      url,
      headers: {
        get: (name) => {
          if (name === 'cache-control') return 'public, max-age=31536000, s-maxage=31536000, immutable';
          if (name === 'etag') return '"etag-live"';
          return '';
        },
      },
    };
  },
});
assert.equal(ok.pass, true);
assert.equal(ok.check208.revalidateStatus, 304);

console.log('shepherd bind-thing-media cache harness tests passed');
