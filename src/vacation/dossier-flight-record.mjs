import { createHash } from 'node:crypto';

export function flightRecordEvidence(place = {}) {
  if (String(place.category || place.cat || '').toLowerCase() !== 'flight') return null;
  const record = place.sourceRecord || {};
  const own = Object.fromEntries(['airline', 'route', 'flightNumber', 'flight_number', 'departure', 'arrival',
    'departureTime', 'arrivalTime', 'stops', 'fareClass', 'price', 'longDetails', 'details', 'description']
    .filter((key) => record[key] != null && typeof record[key] !== 'object').map((key) => [key, record[key]]));
  if (!Object.keys(own).length) return null;
  const text = JSON.stringify({ title: place.title || place.name, ...own });
  const identity = createHash('sha256').update(text).digest('hex');
  let source;
  try { source = new URL(place.website || place.url || record.website || record.url); } catch { return null; }
  if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password) return null;
  source.search = '';
  source.hash = `thing-record-${identity}`;
  return { url: source.href, fetchedAt: new Date().toISOString(),
    text, sha256: identity, via: 'thing-record' };
}
