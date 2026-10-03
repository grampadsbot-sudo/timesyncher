import { IMMUTABLE_MEDIA_CACHE_CONTROL } from '../src/vacation/bind-thing-media-cache.mjs';
import { neonRawMediaPath } from '../src/vacation/thing-media-bind.mjs';

function absoluteMediaUrl(base, url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  const origin = String(base || '').replace(/\/+$/, '');
  return `${origin}${text.startsWith('/') ? text : `/${text}`}`;
}

function isBindThingMediaRawUrl(url) {
  return /\/api\/bind-thing-media\b/i.test(String(url || '')) && /\braw=(?:1|true)\b/i.test(String(url || ''));
}

export function collectBindThingMediaRawCandidates({ base, shareToken, sharedJson = {}, bindings = [] }) {
  const seen = new Set();
  const out = [];
  const push = (url, source) => {
    const abs = absoluteMediaUrl(base, url);
    if (!abs || !isBindThingMediaRawUrl(abs) || seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs, source });
  };
  for (const row of bindings) {
    const id = row?.id || row?.bindingId || row?.binding_id;
    if (shareToken && id) push(neonRawMediaPath(shareToken, id), 'bindings_api');
    push(row?.publicUrl || row?.public_url || row?.url, 'bindings_api');
  }
  const media = sharedJson.media || sharedJson.bindings || [];
  for (const row of media) {
    push(row?.publicUrl || row?.public_url || row?.url, 'shared_json_media');
    const id = row?.id || row?.bindingId;
    if (shareToken && id) push(neonRawMediaPath(shareToken, id), 'shared_json_binding_id');
  }
  for (const place of sharedJson.places || []) {
    push(place?.image_url || place?.imageUrl, 'shared_place_image');
  }
  return out;
}

export async function pickFirstOkBindThingMediaUrl(candidates, fetchImpl = fetch) {
  const tried = [];
  for (const row of candidates) {
    let res;
    try {
      res = await fetchImpl(row.url, { method: 'GET', redirect: 'follow' });
    } catch (err) {
      tried.push({ url: row.url, source: row.source, status: 0, error: String(err?.message || err) });
      continue;
    }
    tried.push({ url: row.url, source: row.source, status: res.status });
    if (res.status === 200) {
      return { ok: true, url: row.url, source: row.source, response: res, tried };
    }
  }
  return { ok: false, tried };
}

async function verifyBindThingMediaCacheResponse(firstRes, fetchImpl = fetch) {
  const url = firstRes.url;
  const cacheControl = String(firstRes.headers?.get?.('cache-control') || '');
  const etag = String(firstRes.headers?.get?.('etag') || '');
  if (!cacheControl.includes('immutable')) {
    return {
      pass: false,
      failReason: 'bind_thing_media_cache_control_not_immutable',
      url,
      cacheControl,
      etag,
    };
  }
  if (!etag) {
    return {
      pass: false,
      failReason: 'bind_thing_media_missing_etag',
      url,
      cacheControl,
      etag,
    };
  }
  const second = await fetchImpl(url, { headers: { 'if-none-match': etag } });
  if (second.status !== 304) {
    return {
      pass: false,
      failReason: `bind_thing_media_cache_revalidate_expected_304_got_${second.status}`,
      url,
      cacheControl,
      etag,
      revalidateStatus: second.status,
    };
  }
  return {
    pass: true,
    url,
    cacheControl,
    etag,
    expectedCacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
    revalidateStatus: 304,
  };
}

export async function runBindThingMediaCacheCheck({
  BASE,
  prep = {},
  fetchImpl = fetch,
} = {}) {
  const shareToken = prep.shareSlug || '';
  const sharedJson = prep.sharedApi?.json || {};
  let bindings = [];
  if (shareToken) {
    try {
      const listRes = await fetchImpl(`${BASE.replace(/\/+$/, '')}/api/bind-thing-media?shareToken=${encodeURIComponent(shareToken)}`);
      if (listRes.ok) {
        const body = await listRes.json();
        bindings = body.bindings || body.media || body.items || [];
      }
    } catch (listErr) {
      bindings = [];
      void listErr;
    }
  }
  const candidates = collectBindThingMediaRawCandidates({
    base: BASE,
    shareToken,
    sharedJson,
    bindings,
  });
  const picked = await pickFirstOkBindThingMediaUrl(candidates, fetchImpl);
  if (!picked.ok) {
    return {
      pass: false,
      http: picked.tried.find((t) => t.status)?.status || 404,
      check208: {
        pass: false,
        failReason: candidates.length
          ? 'no_bind_thing_media_raw_url_returned_200'
          : 'no_bind_thing_media_raw_candidates',
        shareToken,
        candidateCount: candidates.length,
        tried: picked.tried,
      },
    };
  }
  const cache = await verifyBindThingMediaCacheResponse(picked.response, fetchImpl);
  return {
    pass: cache.pass,
    http: 200,
    check208: {
      pass: cache.pass,
      failReason: cache.pass ? null : cache.failReason,
      pickedUrl: picked.url,
      pickedSource: picked.source,
      tried: picked.tried,
      cacheControl: cache.cacheControl,
      etag: cache.etag,
      revalidateStatus: cache.revalidateStatus,
    },
  };
}
