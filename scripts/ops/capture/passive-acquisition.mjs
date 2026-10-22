import crypto from 'crypto';

export const TILE_PATH_RE = /\/\d{1,2}\/\d{1,7}\/\d{1,7}(@2x)?\.(png|jpe?g|webp)$/i;

const SENSITIVE_QUERY = new Set([
  'access_token', 'token', 'api_key', 'apikey', 'key', 'auth', 'secret', 'password',
  'sharetoken', 'share_token', 'credential', 'session', 'jwt', 'signature', 'sig',
]);

export function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sanitizePublicImageUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname)) return null;
    if (/\/(?:api|shared|auth|private)\//i.test(u.pathname) || /bind-thing-media/i.test(u.pathname)) return null;
    const kept = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      if (SENSITIVE_QUERY.has(k.toLowerCase()) || !['domain', 'sz', 'size', 'w', 'h', 'v', 'version'].includes(k.toLowerCase())) continue;
      kept.set(k, v);
    }
    u.search = kept.toString() ? `?${kept.toString()}` : '';
    return u.href;
  } catch {
    return null;
  }
}

export function isMapTileUrl(raw) {
  try {
    return TILE_PATH_RE.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

export function isPublicLogoImageUrl(raw) {
  const safe = sanitizePublicImageUrl(raw);
  if (!safe) return false;
  if (isMapTileUrl(safe)) return false;
  try {
    const { pathname } = new URL(safe);
    return /\/ts-thing-logos?\//i.test(pathname)
      || /\.(png|jpe?g|webp|svg|ico|gif)(\?|$)/i.test(pathname);
  } catch {
    return false;
  }
}

export function tileRequestRecord({ w, t0, url, status, contentType, bytes, bodySha256, failure = null }) {
  const u = new URL(url);
  const rec = {
    w,
    host: u.host,
    status,
    content_type: contentType,
    bytes,
    t_ms: Date.now() - t0,
    url: sanitizePublicImageUrl(url),
  };
  if (bodySha256) rec.body_sha256 = bodySha256;
  if (failure) rec.failure = failure;
  return rec;
}

export function logoRequestRecord({ w, t0, url, status, contentType, bytes, bodySha256, failure = null }) {
  const safe = sanitizePublicImageUrl(url);
  if (!safe) return null;
  const u = new URL(safe);
  const rec = {
    w,
    host: u.host,
    status,
    content_type: contentType,
    bytes,
    t_ms: Date.now() - t0,
    url: safe,
  };
  if (bodySha256) rec.body_sha256 = bodySha256;
  if (failure) rec.failure = failure;
  return rec;
}

export function summarizeImageHosts(requests) {
  const tileSum = {};
  for (const q of requests) {
    const k = `${q.host} ${q.status}`;
    tileSum[k] = (tileSum[k] || 0) + 1;
  }
  return tileSum;
}

export function indexBodyShaByUrl(requests) {
  const byUrl = new Map();
  for (const q of requests) {
    if (q.url && q.body_sha256) byUrl.set(q.url, q.body_sha256);
  }
  return byUrl;
}

export function attachTileBodyHashes(domTiles, byUrl) {
  return domTiles.map((t) => {
    const safe = sanitizePublicImageUrl(t.url);
    const body_sha256 = safe ? (byUrl.get(safe) || null) : null;
    return { ...t, url: safe, body_sha256 };
  });
}

export function buildTileShotRecord({
  shot, w, dom, t, tileLog,
}) {
  const got = tileLog.requests.filter((q) => q.w === w && q.status === 200 && /^image\//i.test(q.content_type || '')).length;
  const sizes = new Set(tileLog.requests.filter((q) => q.w === w && q.t_ms <= t && q.status === 200 && /^image\//i.test(q.content_type || '') && q.bytes != null).map((q) => q.bytes));
  const byUrl = indexBodyShaByUrl(tileLog.requests.filter((q) => q.w === w && q.t_ms <= t));
  const dom_tiles = attachTileBodyHashes(dom.tiles || [], byUrl);
  return {
    shot,
    w,
    loaded_before_shot: dom.loaded,
    dom_tiles_total: dom.total,
    dom_tiles_loaded: dom.loaded,
    status200_so_far: got,
    markers: dom.markers,
    distinct_tile_bytes: sizes.size,
    t_ms: t,
    dom_tiles,
  };
}

export function buildLogoShotRecord({ shot, w, t, domLogos }) {
  return { shot, w, t_ms: t, logos: domLogos };
}

export const DOM_TILE_EVAL = `(() => {
  const imgs = [...document.querySelectorAll('.leaflet-container img.leaflet-tile')];
  const pins = [...document.querySelectorAll('.leaflet-container .leaflet-marker-icon')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const box = (r) => [r.left, r.top, r.width, r.height];
  const tiles = imgs.map((i) => ({
    url: (i.currentSrc || i.src || ''),
    rect: box(i.getBoundingClientRect()),
    complete: i.complete,
    natural: [i.naturalWidth, i.naturalHeight],
    loaded: i.complete && i.naturalWidth > 0,
    tile_loaded_class: i.classList.contains('leaflet-tile-loaded'),
  }));
  return {
    total: imgs.length,
    loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    markers: pins.length,
    tiles,
  };
})()`;

