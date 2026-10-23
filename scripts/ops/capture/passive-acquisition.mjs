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

export function buildLogoShotRecord({ shot, w, t, domLogos, logo_event_links = null }) {
  const rec = { shot, w, t_ms: t, logos: domLogos };
  if (logo_event_links) rec.logo_event_links = logo_event_links;
  return rec;
}

export function logoRowIdentityFromRowData({
  rowInstance = null,
  placeId = null,
  thingId = null,
  cat = null,
  hasLogo = null,
  logoSrc = null,
  name = null,
} = {}) {
  const place_id = placeId ? String(placeId).trim() : null;
  const thing_id = thingId ? String(thingId).trim() : null;
  const row_cat = cat ? String(cat).trim() : null;
  const has_logo = hasLogo == null || hasLogo === '' ? null : String(hasLogo);
  const logo_src = logoSrc ? sanitizePublicImageUrl(String(logoSrc).trim()) : null;
  const row_name = name ? String(name).replace(/\s+/g, ' ').trim().slice(0, 80) : null;
  if (!place_id && !thing_id && !row_cat && has_logo == null && !logo_src && !row_name) return null;
  return { row_instance: rowInstance || null, place_id, thing_id, row_cat, has_logo, logo_src, row_name };
}

export function logoRowKindFromRowData({ summarySrc = null, hasLogo = null, listRow = false } = {}) {
  const summary = summarySrc ? String(summarySrc).trim() : null;
  if (summary === 'thing') return 'saved';
  const hl = hasLogo == null || hasLogo === '' ? null : String(hasLogo);
  if (listRow && hl === '1') return 'recommendation';
  return null;
}

export function logoRowIdentityKey(identity) {
  if (!identity) return null;
  if (identity.row_instance) return `node:${identity.row_instance}`;
  if (identity.thing_id) return `thing:${identity.thing_id}`;
  if (identity.place_id) return `place:${identity.place_id}`;
  const parts = [
    identity.row_cat || '',
    identity.has_logo ?? '',
    identity.logo_src || '',
    identity.row_name || '',
  ];
  if (parts.every((p) => !p)) return null;
  return `row:${parts.join('|')}`;
}

export function sanitizeLogoPassiveBrowserEvent(raw, sanitizeUrl = sanitizePublicImageUrl) {
  if (!raw || typeof raw !== 'object') return null;
  const identity = logoRowIdentityFromRowData({
    rowInstance: raw.identity?.row_instance,
    placeId: raw.identity?.place_id,
    thingId: raw.identity?.thing_id,
    cat: raw.identity?.cat ?? raw.identity?.row_cat,
    hasLogo: raw.identity?.has_logo,
    logoSrc: raw.identity?.logo_src,
    name: raw.identity?.name ?? raw.identity?.row_name,
  });
  if (!identity) return null;
  const url = sanitizeUrl(raw.url || '');
  const initial_src = sanitizeUrl(raw.initial_src || raw.url || '');
  const row_kind = raw.row_kind === 'saved' || raw.row_kind === 'recommendation' ? raw.row_kind : null;
  return {
    type: raw.type === 'error' ? 'error' : 'load',
    wall_ms: Number.isFinite(raw.wall_ms) ? raw.wall_ms : null,
    t_ms: Number.isFinite(raw.t_ms) ? raw.t_ms : null,
    url,
    initial_src: initial_src || url,
    natural: Array.isArray(raw.natural) ? [Number(raw.natural[0]) || 0, Number(raw.natural[1]) || 0] : null,
    complete: Boolean(raw.complete),
    identity,
    row_kind,
  };
}

export function logoPassiveEventRecord({ w, t0, browserEvent }) {
  const body = sanitizeLogoPassiveBrowserEvent(browserEvent);
  if (!body) return null;
  const rec = { w, ...body, t_ms: body.wall_ms != null ? body.wall_ms - t0 : body.t_ms != null ? body.t_ms : Date.now() - t0 };
  return rec;
}

export function correlateLogoPassiveEventsToShotRows({ domLogos, events, w, shot_t_ms = Infinity }) {
  const links = [];
  for (let i = 0; i < domLogos.length; i++) {
    const row = domLogos[i];
    const key = logoRowIdentityKey(row.row_identity);
    if (!key) {
      links.push({ row_index: i, event_indexes: [], identity_key: null });
      continue;
    }
    const event_indexes = [];
    for (let j = 0; j < events.length; j++) {
      const ev = events[j];
      if (w != null && ev.w !== w) continue;
      if (!row.row_kind || ev.row_kind !== row.row_kind) continue;
      if (ev.t_ms != null && ev.t_ms > shot_t_ms) continue;
      const evKey = logoRowIdentityKey(ev.identity);
      if (evKey && evKey === key) event_indexes.push(j);
    }
    links.push({ row_index: i, event_indexes, identity_key: key });
  }
  return links;
}

function domLogosFromCaptureRegionItems(items) {
  return (items || []).filter((row) => row.img).map((row) => {
    const row_identity = logoRowIdentityFromRowData({
      rowInstance: row.row_instance,
      placeId: row.place_id,
      thingId: row.thing_id,
      cat: row.cat,
      hasLogo: row.has_logo,
      logoSrc: row.logo_src,
      name: row.name,
    });
    const row_kind = logoRowKindFromRowData({
      summarySrc: row.summary_src,
      hasLogo: row.has_logo,
      listRow: true,
    });
    return {
      row_cat: row.cat,
      url: sanitizePublicImageUrl(row.img.src),
      rect: row.img.box,
      natural: row.img.natural,
      loaded: row.img.loaded,
      visible: row.img.visible,
      row_identity,
      row_kind,
    };
  });
}

export function appendLogoShotFromCapture({ w, t0, shot, logoLog, regionItems, rawEvents }) {
  for (const raw of rawEvents || []) {
    const rec = logoPassiveEventRecord({ w, t0, browserEvent: raw });
    if (rec) logoLog.events.push(rec);
  }
  const t = Date.now() - t0;
  const domLogos = domLogosFromCaptureRegionItems(regionItems);
  const logo_event_links = correlateLogoPassiveEventsToShotRows({
    domLogos, events: logoLog.events, w, shot_t_ms: t,
  });
  logoLog.shots.push(buildLogoShotRecord({ shot, w, t, domLogos, logo_event_links }));
}

export const DRAIN_LOGO_PASSIVE_EVENTS_EVAL = `(() => {
  const q = window.__tsLogoPassiveEvents || [];
  return q.splice(0, q.length);
})()`;

export const LOGO_PASSIVE_OBSERVER_INIT = `(() => {
  if (window.__tsLogoPassiveInstalled) return;
  window.__tsLogoPassiveInstalled = true;
  const MAX = 800;
  const events = [];
  let observedEvents = 0;
  const rowInstances = new WeakMap();
  let nextRowInstance = 0;
  window.__tsLogoPassiveRowInstance = (row) => {
    if (!rowInstances.has(row)) rowInstances.set(row, String(++nextRowInstance));
    return rowInstances.get(row);
  };
  window.__tsLogoPassiveEvents = events;
  const rowIdentity = (li) => {
    if (!li) return null;
    const place_id = li.getAttribute('data-place-id') || li.dataset.placeId || null;
    const thing_id = li.getAttribute('data-thing-id') || li.dataset.thingId || null;
    const row_cat = li.dataset.thingCategory || li.getAttribute('data-thing-category') || null;
    const has_logo = li.dataset.hasLogo ?? li.getAttribute('data-has-logo') ?? null;
    const logo_src = (li.dataset.logoSrc ?? li.getAttribute('data-logo-src') ?? '') || null;
    const nameEl = li.querySelector('[data-ts-list-row-name]');
    const row_name = nameEl ? (nameEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80) : null;
    if (!place_id && !thing_id && !row_cat && (has_logo == null || has_logo === '') && !logo_src && !row_name) return null;
    return {
      row_instance: window.__tsLogoPassiveRowInstance(li),
      place_id,
      thing_id,
      row_cat,
      has_logo: has_logo == null || has_logo === '' ? null : String(has_logo),
      logo_src: logo_src ? String(logo_src).slice(0, 200) : null,
      row_name,
    };
  };
  const rowKind = (li) => {
    if (!li) return null;
    const summarySrc = li.getAttribute('data-summary-src') || li.dataset.summarySrc || null;
    if (summarySrc === 'thing' || li.querySelector('[data-summary-stored="1"]')) return 'saved';
    if (li.hasAttribute('data-list-row') && String(li.dataset.hasLogo ?? li.getAttribute('data-has-logo') ?? '') === '1') {
      return 'recommendation';
    }
    return null;
  };
  const isLogoRowImg = (img) => {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest('.leaflet-container')) return false;
    const chip = img.closest('[data-ts-logo-chip]');
    const li = img.closest('li[data-list-row]');
    if (chip && li) return true;
    return Boolean(li && img.classList.contains('tiny-logo'));
  };
  const pushEvent = (type, img) => {
    if (!isLogoRowImg(img)) return;
    const li = img.closest('li[data-list-row]');
    const identity = rowIdentity(li);
    if (!identity) return;
    if (observedEvents >= MAX) return;
    observedEvents++;
    const rawUrl = img.currentSrc || img.src || '';
    events.push({
      type,
      wall_ms: performance.timeOrigin + performance.now(),
      t_ms: Math.round(performance.now()),
      url: rawUrl.slice(0, 500),
      initial_src: (img.getAttribute('src') || '').slice(0, 500),
      natural: [img.naturalWidth, img.naturalHeight],
      complete: img.complete,
      identity,
      row_kind: rowKind(li),
    });
  };
  document.addEventListener('load', (e) => {
    if (e.target && e.target.tagName === 'IMG') pushEvent('load', e.target);
  }, true);
  document.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'IMG') pushEvent('error', e.target);
  }, true);
})();`;

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

