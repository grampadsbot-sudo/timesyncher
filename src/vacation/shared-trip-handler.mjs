import { sql } from './db.mjs';
import { cleanText, headerValue, sendJson } from './http.mjs';
import { intakeShareSlug, sharedTripFromIntake } from './intake-shared-trip.mjs';
import { TREK_SHARED_API_BASE, mergeBindingsIntoShared, stripKeepsakeJunkMedia } from './thing-media-bind.mjs';
import { listBindings } from './thing-media-store.mjs';
import { applyCapturedLogos } from './thing-logo-capture.mjs';
import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';
import { padKeepsakeSharedPlaces } from './keepsake-list-minimums.mjs';
import { realTripSummary } from './keepsake-style2.mjs';

const TREK_PUBLIC = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE).replace(/\/+$/, '');

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

function isSharedTripGet(method, trekPath) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const rest = String(trekPath || '').split('/').slice(1).filter(Boolean).join('/');
  return !rest || rest === '';
}

async function intakeSharedResponse(shareToken) {
  if (!shareToken || !shareToken.startsWith('intake-')) return null;
  let db;
  try {
    db = sql(process.env);
  } catch {
    return null;
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
    select id, category, title, description, metadata
    from trip_things
    where trip_id = ${trip.id}
    order by created_at asc
  `;
  return sharedTripFromIntake({
    trip,
    things: things.map((row) => {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      return {
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description || '',
        who: meta.who || '',
        whenLabel: meta.whenLabel || '',
        customerWhen: meta.customerWhen || '',
        notes: Array.isArray(meta.notes) ? meta.notes : [],
        collaboratorNotes: Array.isArray(meta.collaboratorNotes) ? meta.collaboratorNotes : [],
      };
    }),
  });
}

export default async function handler(req, res) {
  const trekPath = trekPathFromReq(req);
  const shareToken = shareTokenFromTrekPath(trekPath);
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
  if (!shared || typeof shared !== 'object') {
    return sendJson(res, upstream.status, shared || { ok: false, error: 'Upstream shared trip failed.' });
  }

  const bindings = shareToken ? await listBindings(shareToken, process.env) : [];
  const merged = applyCapturedLogos(applyProductKeepsakeOverrides(padKeepsakeSharedPlaces(stripKeepsakeJunkMedia(mergeBindingsIntoShared(shared, bindings)))));
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
