import { IMMUTABLE_MEDIA_CACHE_CONTROL } from '../src/vacation/bind-thing-media-cache.mjs';
import {
  deleteSmokeBindThingMediaSeed,
  insertSmokeBindThingMediaSeed,
} from './shepherd-staging-smoke-bind-thing-media-seed.mjs';

function check208Payload(pass, failReason, extra = {}) {
  return {
    pass,
    failReason: pass ? null : failReason,
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
  const repeat = await fetchImpl(url, { method: 'GET' });
  const vercelCache = String(repeat.headers?.get?.('x-vercel-cache') || '');
  if (vercelCache.toUpperCase().includes('HIT')) {
    return { pass: true, mode: 'x-vercel-cache-hit', vercelCache, expectedCacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL, ...base };
  }
  const revalidate = await fetchImpl(url, { headers: { 'if-none-match': etag } });
  if (revalidate.status === 304) {
    return {
      pass: true,
      mode: 'if-none-match-304',
      vercelCache,
      revalidateStatus: 304,
      expectedCacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
      ...base,
    };
  }
  return {
    pass: false,
    failReason: `bind_thing_media_cache_revalidate_expected_hit_or_304_got_${revalidate.status}`,
    vercelCache,
    revalidateStatus: revalidate.status,
    ...base,
  };
}

export async function runBindThingMediaCacheCheck({ BASE, fetchImpl = fetch, env = process.env } = {}) {
  const inserted = await insertSmokeBindThingMediaSeed({ base: BASE, env });
  if (!inserted.ok) {
    const detail = inserted.error ? `${inserted.reason}:${inserted.error}` : inserted.reason;
    return {
      pass: false,
      http: 0,
      check208: check208Payload(false, detail, { seed: inserted.seed || null }),
    };
  }
  const { seed } = inserted;
  const seededUrl = seed.seededUrl;
  try {
    let res;
    try {
      res = await fetchImpl(seededUrl, { method: 'GET', redirect: 'follow' });
    } catch (err) {
      return {
        pass: false,
        http: 0,
        check208: check208Payload(false, 'harness_seeded_bind_thing_media_fetch_error', {
          seededUrl,
          seed,
          error: String(err?.message || err),
        }),
      };
    }
    if (res.status !== 200) {
      return {
        pass: false,
        http: res.status,
        check208: check208Payload(false, `harness_seeded_bind_thing_media_not_found_http_${res.status}`, { seededUrl, seed }),
      };
    }
    const cache = await verifyBindThingMediaCacheResponse(res, fetchImpl);
    return {
      pass: cache.pass,
      http: 200,
      check208: check208Payload(cache.pass, cache.failReason, {
        seededUrl,
        seed,
        mode: cache.mode,
        vercelCache: cache.vercelCache,
        cacheControl: cache.cacheControl,
        etag: cache.etag,
        revalidateStatus: cache.revalidateStatus,
      }),
    };
  } finally {
    try {
      await deleteSmokeBindThingMediaSeed(seed, env);
    } catch (error) {
      console.error(`bind thing media seed cleanup failed: ${error?.message || error}`);
    }
  }
}
