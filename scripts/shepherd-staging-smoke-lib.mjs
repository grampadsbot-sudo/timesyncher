import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const MAUI_MAP_BOUNDS = {
  latMin: 20.5,
  latMax: 21.1,
  lngMin: -156.75,
  lngMax: -155.95,
};

/** ISO calendar date from starts_at (never String(Date)). */
export function isoDateFromStartsAt(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

export function d1StartsOnDate(startsAt, expected = '2027-03-13') {
  return isoDateFromStartsAt(startsAt) === expected;
}

function normalizeTitle(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Does this customer turn text reasonably request this thing title? */
export function turnTextRequestsThing(turnText, thingTitle) {
  const body = normalizeTitle(turnText);
  const title = normalizeTitle(thingTitle);
  if (!body || !title) return false;
  if (body.includes(title)) return true;
  const tokens = title.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length >= 2 && tokens.every((t) => body.includes(t))) return true;
  if (/paia/.test(title) && /paia/.test(body) && /fish/.test(title)) return true;
  if (/mama/.test(title) && /mama/.test(body) && /fish/.test(title)) return true;
  return false;
}

function thingIdsFromTurnResponse(json = {}) {
  const ids = new Set();
  if (json.thingId) ids.add(String(json.thingId));
  for (const row of json.savedThings || []) {
    if (row?.thingId) ids.add(String(row.thingId));
  }
  for (const id of json.savedThingIds || []) ids.add(String(id));
  const results = json.turnActionResults;
  if (results && typeof results === 'object') {
    for (const v of Object.values(results)) {
      if (v?.thingId) ids.add(String(v.thingId));
      if (Array.isArray(v?.thingIds)) for (const id of v.thingIds) ids.add(String(id));
    }
  }
  return ids;
}

/**
 * Attribute each trip_things row to a D customer turn by id (request_id / response thingId only).
 */
export function attributeDThingRows({
  things = [],
  customerTurns = [],
  turnResponses = [],
}) {
  const turnById = new Map(customerTurns.map((t) => [String(t.id), t]));
  const requestToTurn = new Map();
  for (const t of customerTurns) {
    if (t.request_id) requestToTurn.set(String(t.request_id), String(t.id));
  }
  const thingToTurn = new Map();
  for (const { turnId, json } of turnResponses) {
    for (const thingId of thingIdsFromTurnResponse(json)) {
      thingToTurn.set(thingId, String(turnId));
    }
  }

  return things.map((row) => {
    const thingId = String(row.id);
    let creatingTurnId = thingToTurn.get(thingId) || null;
    const meta = row.metadata || {};
    const req = meta.source_request_id || meta.sourceRequestId || row.source_request_id || null;
    if (!creatingTurnId && req && requestToTurn.has(String(req))) {
      creatingTurnId = requestToTurn.get(String(req));
    }
    const turn = creatingTurnId ? turnById.get(creatingTurnId) : null;
    return {
      thingId,
      name: row.title,
      source: row.source ?? meta.source ?? null,
      creatingTurnId,
      creatingTurnText: turn?.body || null,
    };
  });
}

export function gradeDExtraRows(attributedRows) {
  const failures = [];
  for (const row of attributedRows) {
    if (!row.creatingTurnId) {
      failures.push({ ...row, reason: 'no_creating_turn' });
      continue;
    }
    if (!turnTextRequestsThing(row.creatingTurnText, row.name)) {
      failures.push({ ...row, reason: 'turn_did_not_request_thing' });
    }
  }
  return failures;
}

export function collaboratorWelcomeTemplatePrefix() {
  const text = renderOnboardingWelcome({
    audience: 'collaborator',
    collabFirstName: 'Invitee',
    ownerFirstName: 'Owner',
    tripTitle: 'Trip',
    tripSiteUrl: 'https://example.com/shared/trip/',
  });
  return text.split('Invitee')[0];
}

/**
 * Match collaborator welcome via vacation_onboarding_welcomes.welcome_for + transcript payload.
 */
/** Transcript app turns tied to vacation_onboarding_welcomes.welcome_for (not time-order heuristics). */
export function welcomeTranscriptTurnsForClaims({ welcomeRows = [], transcriptTurns = [] }) {
  const welcomeForSet = new Set(welcomeRows.map((r) => String(r.welcome_for)));
  return (transcriptTurns || []).filter((t) => {
    if (t.speaker !== 'app') return false;
    const p = t.payload || {};
    if (p.welcomeFor && welcomeForSet.has(String(p.welcomeFor))) return true;
    const audience = String(p.welcomeAudience || '');
    if (audience === 'collaborator' || audience === 'collaborator_no_site') {
      return welcomeRows.length === 1 && welcomeForSet.has(String(welcomeRows[0].welcome_for));
    }
    return false;
  });
}

export function matchCollaboratorWelcome({
  welcomeRows = [],
  transcriptTurns = [],
  welcomeForCustomerId,
  inviteeDisplayName,
}) {
  const welcomeFor = String(welcomeForCustomerId || '').trim();
  const claims = welcomeRows.filter((r) => String(r.welcome_for) === welcomeFor);
  const welcomeTurns = welcomeTranscriptTurnsForClaims({ welcomeRows: claims, transcriptTurns });
  const prefix = collaboratorWelcomeTemplatePrefix();
  const greets = inviteeDisplayName
    ? welcomeTurns.filter((t) => new RegExp(inviteeDisplayName.split(/\s+/)[0], 'i').test(t.body || ''))
    : welcomeTurns;
  const templateOk = welcomeTurns.filter((t) => String(t.body || '').startsWith(prefix.slice(0, 20)));
  return {
    claimCount: claims.length,
    welcomeTurnCount: welcomeTurns.length,
    greetsInviteeCount: greets.length,
    templateMatchCount: templateOk.length,
    welcomeTurns: welcomeTurns.map((t) => ({
      id: t.id,
      welcomeFor: t.payload?.welcomeFor,
      welcomeAudience: t.payload?.welcomeAudience,
      bodySnippet: String(t.body || '').slice(0, 120),
    })),
  };
}

export function a2WelcomePass(match, { redirectOk, publicUrlOk }) {
  return Boolean(publicUrlOk)
    && redirectOk
    && match.claimCount === 1
    && match.welcomeTurnCount === 1
    && match.greetsInviteeCount === 1
    && match.templateMatchCount >= 1;
}

/**
 * Runs in the browser (Puppeteer page.evaluate). Keep Product DOM hooks centralized here.
 */
export function evaluateTripMapInPage() {
  const unresolved = !!document.querySelector('[data-map-center-unresolved]');
  const container = document.querySelector('.leaflet-container, .mapboxgl-map');
  const dataCenter = container?.getAttribute('data-center') || container?.getAttribute('data-map-center') || null;
  const dataBounds = container?.getAttribute('data-bounds') || container?.getAttribute('data-map-bounds') || null;

  function centerFromBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    if (typeof bounds.getCenter === 'function') {
      const c = bounds.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
    if (Array.isArray(bounds) && bounds.length >= 2) {
      const a = bounds[0];
      const b = bounds[1];
      if (Array.isArray(a) && Array.isArray(b)) {
        return { lat: (a[1] + b[1]) / 2, lng: (a[0] + b[0]) / 2 };
      }
    }
    return null;
  }

  let engine = 'none';
  let lat = null;
  let lng = null;
  let zoom = null;
  let bounds = null;
  let centerStatus = 'missing';

  const leafletEl = document.querySelector('.leaflet-container');
  const leaflet = leafletEl?._leaflet_map;
  if (leafletEl) {
    engine = 'leaflet';
    if (leaflet && typeof leaflet.getCenter === 'function') {
      const c = leaflet.getCenter();
      lat = c.lat;
      lng = c.lng;
      zoom = leaflet.getZoom?.() ?? null;
      bounds = leaflet.getBounds?.() || null;
      centerStatus = 'verified';
    } else {
      centerStatus = 'unverified';
    }
  }

  const mapboxEl = document.querySelector('.mapboxgl-map');
  if (mapboxEl && engine === 'none') {
    const mapbox = mapboxEl.mapbox || mapboxEl._mapbox_map || window.mapboxMap;
    if (mapbox && typeof mapbox.getCenter === 'function') {
      engine = 'mapbox';
      const c = mapbox.getCenter();
      lat = typeof c.lat === 'function' ? c.lat() : c.lat;
      lng = typeof c.lng === 'function' ? c.lng() : c.lng;
      zoom = mapbox.getZoom?.() ?? null;
      bounds = mapbox.getBounds?.() || null;
      centerStatus = 'verified';
    } else {
      engine = 'mapbox';
      centerStatus = 'unverified';
    }
  }

  if (centerStatus !== 'verified' && dataCenter) {
    try {
      const parsed = JSON.parse(dataCenter);
      if (parsed?.lat != null && parsed?.lng != null) {
        lat = Number(parsed.lat);
        lng = Number(parsed.lng);
        centerStatus = 'data-attribute';
      }
    } catch {
      const parts = dataCenter.split(',').map(Number);
      if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
        lat = parts[0];
        lng = parts[1];
        centerStatus = 'data-attribute';
      }
    }
  }

  const boundsCenter = centerFromBounds(bounds);
  if (centerStatus === 'unverified' && boundsCenter) {
    lat = boundsCenter.lat;
    lng = boundsCenter.lng;
    centerStatus = 'bounds-derived';
  }

  const mounted = Boolean(container) && engine !== 'none';
  return {
    engine,
    mounted,
    lat,
    lng,
    zoom,
    centerStatus,
    unresolved,
    dataCenter,
    dataBounds,
  };
}

export function mapWithinMaui(state, bounds = MAUI_MAP_BOUNDS) {
  const lat = Number(state?.lat);
  const lng = Number(state?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= bounds.latMin && lat <= bounds.latMax && lng >= bounds.lngMin && lng <= bounds.lngMax;
}

export function gradeMapBar(mapState, consoleErrors = []) {
  const signals = (consoleErrors || []).filter((t) => /map_center_unresolved|map_mount_failed/.test(t));
  const mounted = Boolean(mapState?.mounted);
  const unresolved = Boolean(mapState?.unresolved);
  const verified = mapState?.centerStatus === 'verified' || mapState?.centerStatus === 'bounds-derived';
  const inMaui = verified && mapWithinMaui(mapState);
  const pass = mounted && !unresolved && signals.length === 0 && inMaui;
  return {
    pass,
    mounted,
    unresolved,
    signals,
    centerStatus: mapState?.centerStatus || 'missing',
    inMaui,
  };
}

/** Product shared /shared/<slug>/ Plan tab: Leaflet instance hook (one-line DOM change point). */
export function evaluateLeafletProductMapInPage() {
  const unresolved = !!document.querySelector('[data-map-center-unresolved]');
  const mapError = !!document.querySelector('[data-ts-trip-map-error]');
  const leafletEl = document.querySelector('.leaflet-container');
  const map = leafletEl?._leaflet_map;
  let lat = null;
  let lng = null;
  let zoom = null;
  let bounds = null;
  if (map && typeof map.getCenter === 'function') {
    const c = map.getCenter();
    lat = c.lat;
    lng = c.lng;
    zoom = typeof map.getZoom === 'function' ? map.getZoom() : null;
    const b = typeof map.getBounds === 'function' ? map.getBounds() : null;
    if (b && typeof b.getNorth === 'function') {
      bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
    }
  }
  return {
    engine: 'leaflet',
    mounted: Boolean(leafletEl),
    mapInstance: Boolean(map),
    lat,
    lng,
    zoom,
    bounds,
    unresolved,
    mapError,
  };
}

export function gradeLeafletProductMap(mapState, consoleErrors = []) {
  const signals = (consoleErrors || []).filter((t) => /map_center_unresolved|map_mount_failed|map_/.test(t));
  const inMaui = mapWithinMaui({ lat: mapState?.lat, lng: mapState?.lng });
  const pass = Boolean(mapState?.mounted)
    && Boolean(mapState?.mapInstance)
    && !mapState?.unresolved
    && !mapState?.mapError
    && signals.length === 0
    && inMaui;
  return { pass, inMaui, signals, unresolved: mapState?.unresolved, mapError: mapState?.mapError };
}

/** Evidence that a place-search row is a real coffee shop. */
function coffeePlaceEvidence(place = {}) {
  const name = String(place.name || place.title || '').toLowerCase();
  const cat = String(
    place.category
    || place.categoryName
    || place.category_name
    || place.metadata?.categoryName
    || '',
  ).toLowerCase();
  const tags = place.tags || place.osmTags || place.source?.tags || place.raw?.tags || {};
  const amenity = String(tags.amenity || '').toLowerCase();
  const cuisine = String(tags.cuisine || '').toLowerCase();
  const evidence = [];
  if (/\bcafe\b|coffee|espresso|roaster|latte/.test(name)) evidence.push('name');
  if (/\bcafe\b|coffee/.test(cat)) evidence.push('category');
  if (amenity === 'cafe') evidence.push('osm:amenity=cafe');
  if (cuisine.includes('coffee')) evidence.push('osm:cuisine=coffee');
  return { ok: evidence.length > 0, evidence };
}

export function gradeCoffeeReplyRows(rows = []) {
  const graded = rows.map((row) => {
    const { ok, evidence } = coffeePlaceEvidence(row);
    return {
      name: row.name || row.title,
      ok,
      evidence,
      source: row.provider || row.source || null,
    };
  });
  const failures = graded.filter((r) => !r.ok);
  return { rows: graded, failures, pass: rows.length > 0 && failures.length === 0 };
}

/** Budget tab must not show dollar amounts absent from API budget lines. */
export function budgetHardcodedHits(pageText, budgetLines = []) {
  const allowed = new Set(
    (budgetLines || [])
      .map((b) => Number(b.total_price ?? b.amount ?? b.total))
      .filter((n) => Number.isFinite(n))
      .flatMap((n) => [n, Math.round(n * 100) / 100]),
  );
  const hits = [];
  const re = /\$\s*([\d,]+(?:\.\d{2})?)/g;
  let m;
  const hay = String(pageText || '');
  while ((m = re.exec(hay)) !== null) {
    const num = Number(String(m[1]).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (allowed.size === 0) {
      if (num === 0) continue;
      hits.push({ amount: num, raw: m[0], reason: 'no_budget_lines_but_visible_amount' });
      continue;
    }
    if (!allowed.has(num) && !allowed.has(Math.round(num))) {
      hits.push({ amount: num, raw: m[0], reason: 'amount_not_in_api_budget' });
    }
  }
  return hits;
}

/** Offline replay: re-grade D bar from saved smoke out.json checkD + raw thing dates. */
export function replayDGradesFromSaved(checkD) {
  const d1Thing = checkD?.d1?.thing;
  const startsAt = d1Thing?.starts_at ?? checkD?.d1?.startsAt;
  const d1DateOk = d1StartsOnDate(startsAt);
  const legacyStartsAt = checkD?.d1?.startsAt;
  const legacyDateBug = legacyStartsAt && !/^\d{4}-\d{2}-\d{2}/.test(String(legacyStartsAt))
    && d1StartsOnDate(startsAt);
  const rows = checkD?.dExtra?.rows || [];
  const turns = (checkD?.dCustomerTurnIds || []).map((id, i) => ({
    id,
    body: i === 1 ? "add Mama's Fish House for Saturday" : i === 2 ? 'save Paia Fish Market' : 'Maui March 10-17 2027 with my wife',
    request_id: checkD?.d2?.requestId && i === 2 ? checkD.d2.requestId : null,
  }));
  const things = rows.map((r) => ({
    id: r.thingId,
    title: r.name || r.title,
    source: r.source,
    metadata: {
      source_request_id: r.source_request_id || r.metadata?.source_request_id || null,
    },
  }));
  const d2Json = checkD?.d2?.turnResponse || {};
  const responses = [
    { turnId: checkD?.d1?.customerTurnId || turns[1]?.id, json: checkD?.d1?.turnResponse || { thingId: checkD?.d1?.thingId, sharedDayIds: checkD?.d1?.sharedDayIds } },
    { turnId: checkD?.d2?.customerTurnId || turns[2]?.id, json: d2Json },
  ].filter((r) => r.turnId);
  const attributed = attributeDThingRows({ things, customerTurns: turns, turnResponses: responses });
  const failures = gradeDExtraRows(attributed);
  const legacyWrongPaia = rows.filter((r) => /paia/i.test(r.title || r.name || '') && r.creatingCustomerTurnId === turns[1]?.id).length;
  return {
    d1DateOk,
    iso: isoDateFromStartsAt(startsAt),
    legacyStartsAt,
    legacyDateBug,
    legacyWrongPaia,
    attributed,
    failures,
  };
}

/** Offline replay: A2 welcome match from saved checkA2 (welcomeDb + optional transcript rows). */
export function replayA2FromSaved(checkA2, inviteeDisplayName = 'Spouse964') {
  const welcomeDb = checkA2?.welcomeDb || [];
  const welcomeFor = welcomeDb[0]?.welcome_for || checkA2?.collabCustomerId || null;
  const transcriptTurns = (checkA2?.welcomeTurnsDb || []).map((t) => ({
    id: t.id,
    speaker: 'app',
    body: t.body || '',
    payload: t.payload || { welcomeFor: t.welcomeFor, welcomeAudience: 'collaborator' },
  }));
  const match = matchCollaboratorWelcome({
    welcomeRows: welcomeDb,
    transcriptTurns,
    welcomeForCustomerId: welcomeFor,
    inviteeDisplayName,
  });
  return { welcomeFor, match, wouldPassWithTranscript: match.welcomeTurnCount === 1 };
}
