import { IMMUTABLE_MEDIA_CACHE_CONTROL } from '../src/vacation/bind-thing-media-cache.mjs';
import { neonRawMediaPath } from '../src/vacation/thing-media-bind.mjs';

/** Staging fixture binding known from offline bind-thing-media tests (PR #208). */
export const HARNESS_SEEDED_BIND_THING_MEDIA = {
  shareToken: 'sample-trip',
  bindingId: '6ba36f2a-e9f2-467e-9e61-3aac64fe165a',
};

export function harnessSeededBindThingMediaUrl(base) {
  const origin = String(base || '').replace(/\/+$/, '');
  return `${origin}${neonRawMediaPath(
    HARNESS_SEEDED_BIND_THING_MEDIA.shareToken,
    HARNESS_SEEDED_BIND_THING_MEDIA.bindingId,
  )}`;
}

function check208Payload(pass, failReason, extra = {}) {
  return {
    pass,
    failReason: pass ? null : failReason,
    seededUrl: extra.seededUrl,
    seed: HARNESS_SEEDED_BIND_THING_MEDIA,
    ...extra,
  };
}

async function verifyBindThingMediaCacheResponse(firstRes, fetchImpl = fetch) {
  const url = firstRes.url;
  const cacheControl = String(firstRes.headers?.get?.('cache-control') || '');
  const etag = String(firstRes.headers?.get?.('etag') || '');
  const base = { url, cacheControl, etag };
  if (!cacheControl.includes('immutable')) {
    return { pass: false, failReason: 'bind_thing_media_cache_control_not_immutable', ...base };
  }
  if (!etag) return { pass: false, failReason: 'bind_thing_media_missing_etag', ...base };
  const second = await fetchImpl(url, { headers: { 'if-none-match': etag } });
  if (second.status !== 304) {
    return { pass: false, failReason: `bind_thing_media_cache_revalidate_expected_304_got_${second.status}`, revalidateStatus: second.status, ...base };
  }
  return { pass: true, expectedCacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL, revalidateStatus: 304, ...base };
}

export async function runBindThingMediaCacheCheck({ BASE, fetchImpl = fetch } = {}) {
  const seededUrl = harnessSeededBindThingMediaUrl(BASE);
  let res;
  try {
    res = await fetchImpl(seededUrl, { method: 'GET', redirect: 'follow' });
  } catch (err) {
    return {
      pass: false,
      http: 0,
      check208: check208Payload(false, 'harness_seeded_bind_thing_media_fetch_error', { seededUrl, error: String(err?.message || err) }),
    };
  }
  if (res.status !== 200) {
    return {
      pass: false,
      http: res.status,
      check208: check208Payload(false, `harness_seeded_bind_thing_media_not_found_http_${res.status}`, { seededUrl }),
    };
  }
  const cache = await verifyBindThingMediaCacheResponse(res, fetchImpl);
  return {
    pass: cache.pass,
    http: 200,
    check208: check208Payload(cache.pass, cache.failReason, {
      seededUrl,
      cacheControl: cache.cacheControl,
      etag: cache.etag,
      revalidateStatus: cache.revalidateStatus,
    }),
  };
}
