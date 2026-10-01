import { sql } from './db.mjs';
import { cleanText, headerValue, sendJson } from './http.mjs';
import { applyThingPresentation, intakeShareSlug, sharedTripFromIntake, thingRecordFromTripRow, windLookupPointsFromThings } from './intake-shared-trip.mjs';
import { lookupWindBackup } from './wind-backup.mjs';
import { TREK_SHARED_API_BASE, mergeBindingsIntoShared, stripKeepsakeJunkMedia } from './thing-media-bind.mjs';
import { listBindings } from './thing-media-store.mjs';
import { applyCapturedLogos } from './thing-logo-capture.mjs';
import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';
import { realTripSummary } from './keepsake-style2.mjs';

const TREK_PUBLIC = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE).replace(/\/+$/, '');

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

export async function intakeSharedResponse(shareToken, db = null) {
  if (!shareToken || !shareToken.startsWith('intake-')) return null;
  if (!db) {
    try {
      db = openSharedDb();
    } catch {
      return null;
    }
  }
  const rows = await db`
    select id, title, destination, start_date, end_date, metadata
    from trips
    where metadata->>'publicSlug' = ${shareToken}
      and metadata->>'intakeShare' = 'true'
    limit 1
  `;
  const trip = rows[0];
  if (!trip || intakeShareSlug(trip.id) !== shareToken) return null;
  const things = await db`
    select id, category, title, description, metadata, ratings, location, source
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
  return applyCapturedLogos(applyThingPresentation({ ...shared, forecast: Array.isArray(forecast) ? forecast : [] }));
}

export default async function handler(req, res) {
  const trekPath = trekPathFromReq(req);
  const shareToken = shareTokenFromTrekPath(trekPath);
  if (isIntakeEditAccess(req.method, trekPath, shareToken)) {
    return sendJson(res, 200, { canEdit: false });
  }
  if (isSharedTripGet(req.method, trekPath)) {
    const local = await intakeSharedResponse(shareToken).catch(() => null);
    if (local) return sendJson(res, 200, local);
  }
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const incomingQuery = new URLSearchParams(url.search);
  incomingQuery.delete('trekPath');
  const dest = `${TREK_PUBLIC}/api/shared/${trekPath}${incomingQuery.toString() ? `?${incomingQuery}` : ''}`;

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

  if (!isSharedTripGet(req.method, trekPath) || !contentType.includes('application/json')) {
    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
    return;
  }

  const shared = await upstream.json().catch(() => null);
  // An unknown token is an error payload, not a trip. Do not pad it with catalog Things.
  if (!shared || typeof shared !== 'object' || !shared.trip || Number(upstream.status) >= 400) {
    const status = Number(upstream.status) >= 400 ? upstream.status : 404;
    const error = shared && typeof shared === 'object' && shared.error
      ? shared.error
      : 'Invalid or expired link';
    return sendJson(res, status, { error });
  }

  const bindings = shareToken ? await listBindings(shareToken, process.env) : [];
  const merged = applyCapturedLogos(applyProductKeepsakeOverrides(stripKeepsakeJunkMedia(mergeBindingsIntoShared(shared, bindings))));
  const overrides = merged.thingOverrides && typeof merged.thingOverrides === 'object' ? merged.thingOverrides : {};
  merged.thingOverrides = {
    ...overrides,
    __keepsakeSummary: realTripSummary(merged),
  };
  merged.timesyncherMediaBind = {
    count: bindings.length,
    source: '/api/bind-thing-media',
    journeyBookPath: `/shared/${encodeURIComponent(shareToken)}/journey`,
    style2Path: `/shared/${encodeURIComponent(shareToken)}/journey?style=2`,
    style2PdfPath: `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/style-2`,
  };
  return sendJson(res, 200, merged);
}

export { cleanText };
