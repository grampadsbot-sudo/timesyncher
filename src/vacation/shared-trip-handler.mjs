import { sql } from './db.mjs';
import { cleanText, headerValue, sendJson, vacationAppErrorBody } from './http.mjs';
import { applyThingPresentation, intakeShareSlug, sharedTripFromIntake, thingRecordFromTripRow, windLookupPointsFromThings } from './intake-shared-trip.mjs';
import { lookupWindBackup } from './wind-backup.mjs';
import { applyCapturedLogos } from './thing-logo-capture.mjs';
import { applyTripMetadataBudgetTargets } from './shared-trip-api-budget.mjs';
import { finalizeServedSharedTripPayload } from './shared-trip-served-page.mjs';

let sharedTripDatabase = null;

export function useSharedTripDatabase(db) {
  sharedTripDatabase = db || null;
}

function openSharedDb() {
  if (sharedTripDatabase) return sharedTripDatabase;
  return sql(process.env);
}

function trekPathFromReq(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const fromQuery = url.searchParams.get('trekPath');
  if (fromQuery) return fromQuery.replace(/^\/+/, '');
  return url.pathname.replace(/^\/api\/shared-trip\/?/, '').replace(/^\/api\/shared\/?/, '');
}

function shareTokenFromTrekPath(trekPath = '') {
  const first = String(trekPath || '').split('/')[0] || '';
  try {
    return decodeURIComponent(first).trim();
  } catch {
    return first.trim();
  }
}

function trekRest(trekPath = '') {
  return String(trekPath || '').split('/').slice(1).filter(Boolean).join('/');
}

function isSharedTripGet(method, trekPath) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return trekRest(trekPath) === '';
}

function isIntakeEditAccess(method, trekPath, shareToken) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (!String(shareToken || '').startsWith('intake-')) return false;
  return trekRest(trekPath) === 'edit-access';
}

function logSharedTripFailure(event, shareToken, error) {
  console.error(JSON.stringify({
    event,
    shareToken: String(shareToken || ''),
    error: String(error?.message || error || ''),
  }));
}

function slugMissError(shareToken) {
  const slug = String(shareToken || '').trim();
  const error = new Error(`shared_trip_slug_not_found ${slug}`.trim());
  error.code = 'shared_trip_slug_not_found';
  return error;
}

function intakeSlugHex(shareToken) {
  const hex = String(shareToken || '').slice('intake-'.length);
  return /^[0-9a-f]{12}$/i.test(hex) ? hex.toLowerCase() : '';
}

function intakeTripMetadata(meta = {}) {
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function intakeTripIsShareable(trip) {
  const meta = intakeTripMetadata(trip?.metadata);
  if (meta.intakeShare === true || meta.intakeShare === 'true') return true;
  return String(trip?.status || '').trim() === 'onboarding';
}

async function loadIntakeTripRow(shareToken, db) {
  const published = await db`
    select id, title, destination, start_date, end_date, metadata, status
    from trips
    where metadata->>'publicSlug' = ${shareToken}
      and metadata->>'intakeShare' = 'true'
    limit 1
  `;
  const publishedTrip = published[0];
  if (publishedTrip && intakeShareSlug(publishedTrip.id) === shareToken) return publishedTrip;

  const hex = intakeSlugHex(shareToken);
  if (!hex) return null;
  const candidates = await db`
    select id, title, destination, start_date, end_date, metadata, status
    from trips
    where replace(id::text, '-', '') ilike ${`${hex}%`}
    limit 6
  `;
  const trip = candidates.find((row) => intakeShareSlug(row.id) === shareToken);
  if (!trip || !intakeTripIsShareable(trip)) return null;
  return trip;
}

export async function intakeSharedResponse(shareToken, db = null) {
  if (!shareToken || !shareToken.startsWith('intake-')) return null;
  if (!db) db = openSharedDb();
  const trip = await loadIntakeTripRow(shareToken, db);
  if (!trip) return null;
  const things = await db`
    select id, category, title, description, metadata, ratings, location, source, starts_at
    from trip_things
    where trip_id = ${trip.id}
    order by created_at asc
  `;
  const mappedThings = things.map((row) => thingRecordFromTripRow(row));
  const shared = sharedTripFromIntake({ trip, things: mappedThings });
  let forecast = [];
  try {
    forecast = await lookupWindBackup(windLookupPointsFromThings(mappedThings), {
      startDate: trip.start_date,
      endDate: trip.end_date,
      timeoutMs: 2000,
    });
  } catch {
    forecast = [];
  }
  const presented = applyThingPresentation({ ...shared, forecast: Array.isArray(forecast) ? forecast : [] });
  const captured = applyCapturedLogos(presented);
  const withBudgetTargets = applyTripMetadataBudgetTargets(captured, trip);
  return finalizeServedSharedTripPayload(withBudgetTargets);
}

function sendSlugMiss(res, shareToken) {
  const miss = slugMissError(shareToken);
  logSharedTripFailure(miss.code, shareToken, miss);
  return sendJson(res, 404, {
    ...vacationAppErrorBody({
      code: miss.code,
      error: miss.message,
      customerMessage: 'This itinerary link is not available yet. Please open the vacation app and try again.',
    }),
    slug: String(shareToken || ''),
  });
}

async function respondSharedTripGet(req, res, shareToken) {
  try {
    const local = await intakeSharedResponse(shareToken);
    if (local) return sendJson(res, 200, local);
    if (String(shareToken || '').startsWith('intake-')) return sendSlugMiss(res, shareToken);
    return await proxyConfiguredUpstream(req, res, shareToken);
  } catch (error) {
    logSharedTripFailure('shared_trip_lookup_failed', shareToken, error);
    return sendJson(res, 500, {
      ok: false,
      code: 'shared_trip_lookup_failed',
      error: String(error?.message || error),
      shareToken: String(shareToken || ''),
    });
  }
}

function trekUpstreamBase() {
  const base = String(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    const error = new Error('shared trip upstream base is not configured');
    error.code = 'shared_trip_upstream_unconfigured';
    throw error;
  }
  return base;
}

async function proxyConfiguredUpstream(req, res, trekPath) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const incomingQuery = new URLSearchParams(url.search);
  incomingQuery.delete('trekPath');
  const dest = `${trekUpstreamBase()}/api/shared/${trekPath}${incomingQuery.toString() ? `?${incomingQuery}` : ''}`;
  const headers = {};
  for (const name of ['accept', 'content-type', 'cookie', 'authorization']) {
    const value = headerValue(req, name);
    if (value) headers[name] = value;
  }
  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(chunk);
  }
  const upstream = await fetch(dest, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  const contentType = upstream.headers.get('content-type') || '';
  res.statusCode = upstream.status;
  res.setHeader('cache-control', 'no-store');
  if (contentType) res.setHeader('content-type', contentType);
  const body = Buffer.from(await upstream.arrayBuffer());
  res.end(body);
}

export default async function handler(req, res) {
  const trekPath = trekPathFromReq(req);
  const shareToken = shareTokenFromTrekPath(trekPath);
  if (isIntakeEditAccess(req.method, trekPath, shareToken)) {
    return sendJson(res, 200, { canEdit: false });
  }
  if (isSharedTripGet(req.method, trekPath)) {
    return respondSharedTripGet(req, res, shareToken);
  }
  if (String(shareToken || '').startsWith('intake-')) {
    return sendSlugMiss(res, shareToken);
  }
  try {
    return await proxyConfiguredUpstream(req, res, trekPath);
  } catch (error) {
    logSharedTripFailure(error.code || 'shared_trip_upstream_failed', shareToken, error);
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      code: error.code || 'shared_trip_upstream_failed',
      error: String(error?.message || error),
      slug: String(shareToken || ''),
    });
  }
}

export { cleanText };
