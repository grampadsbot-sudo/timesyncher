import { timingSafeEqual } from 'node:crypto';
import { applyDiscoveredPageIcon } from './intake-shared-place-source.mjs';

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function fail(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

export function authorizeLogoReenrichment({ token, actor }, env = process.env) {
  const expected = String(env.TIMESYNCHER_ADMIN_TOKEN || '');
  if (!expected) throw fail('TIMESYNCHER_ADMIN_TOKEN is not configured.', 503);
  const left = Buffer.from(String(token || ''));
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw fail('Unauthorized logo re-enrichment request.', 401);
  const name = clean(actor, 120);
  if (!name) throw fail('actor is required.', 400);
  return name;
}

function currentLogo(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const source = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  return clean(meta.logoUrl || source.logoUrl, 2000);
}

function withMissingLogoFlag(metadata) {
  const missing = Array.isArray(metadata.missingFields) ? metadata.missingFields : [];
  return missing.includes('logo') ? metadata : { ...metadata, missingFields: [...missing, 'logo'] };
}

async function discover(row, fetchImpl) {
  const probe = { metadata: structuredClone(row.metadata || {}) };
  await applyDiscoveredPageIcon(probe, { fetchImpl });
  const found = clean(probe.metadata.logoUrl, 2000);
  if (found) return { logoUrl: found, sourceUrl: clean(probe.metadata.sourceRecord?.logoProvenance?.pageUrl, 2000), metadata: probe.metadata };
  return { reason: probe.metadata.logoCaptureReason || 'no_logo_discovered' };
}

export async function reenrichTripLogos({
  db,
  tripId,
  thingIds,
  actor,
  apply = false,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const trip = clean(tripId, 80);
  const ids = [...new Set((Array.isArray(thingIds) ? thingIds : []).map((id) => clean(id, 80)).filter(Boolean))];
  if (!trip) throw fail('tripId is required.', 400);
  if (!ids.length) throw fail('thingIds must name at least one target.', 400);
  const rows = await db`
    select id, trip_id, title, metadata
    from trip_things
    where trip_id = ${trip} and id = any(${ids})
  `;
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) throw fail(`Target ids outside trip ${trip}: ${unknown.join(', ')}`, 403);

  const report = [];
  for (const id of ids) {
    const row = byId.get(id);
    const old = currentLogo(row);
    const entry = { id, title: row.title, old, new: '', sourceUrl: '', outcome: 'skipped_has_logo', at: now(), actor };
    if (!old) {
      const result = await discover(row, fetchImpl);
      if (result.logoUrl) Object.assign(entry, { new: result.logoUrl, sourceUrl: result.sourceUrl, outcome: 'filled' });
      else Object.assign(entry, { outcome: 'unavailable', reason: result.reason });
      entry.metadata = result.logoUrl ? result.metadata : withMissingLogoFlag({ ...(row.metadata || {}), logoCaptureReason: result.reason });
    }
    report.push(entry);
  }
  if (!apply) return { dryRun: true, tripId: trip, report: report.map(({ metadata, ...rest }) => rest) };

  for (const entry of report) {
    if (entry.outcome === 'skipped_has_logo') continue;
    const updated = await db`
      update trip_things
      set metadata = ${JSON.stringify(entry.metadata)}::jsonb, updated_at = now()
      where id = ${entry.id} and trip_id = ${trip}
        and coalesce(metadata->>'logoUrl', '') = ''
        and coalesce(metadata->'sourceRecord'->>'logoUrl', '') = ''
      returning id
    `;
    if (!updated.length) { entry.outcome = 'skipped_has_logo'; continue; }
    await db`
      insert into trip_thing_logo_audit (trip_id, thing_id, actor, old_value, new_value, source_url, outcome, created_at)
      values (${trip}, ${entry.id}, ${entry.actor}, ${entry.old || null}, ${entry.new || null}, ${entry.sourceUrl || null}, ${entry.outcome}, ${entry.at})
    `;
  }
  return { dryRun: false, tripId: trip, report: report.map(({ metadata, ...rest }) => rest) };
}
