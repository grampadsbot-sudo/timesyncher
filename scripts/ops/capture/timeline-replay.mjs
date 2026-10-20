import crypto from 'node:crypto';

export function prepareTimelineReplay(bytes) {
  const trip = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(trip.places)) throw new TypeError('places must be an array');
  const overrides = { ...(trip.thingOverrides || {}) };
  const selected = [];
  for (const place of trip.places) {
    const key = `place:${place.id}`;
    const prior = { ...(overrides[key] || {}) };
    if (prior.timeline != null && typeof prior.timeline !== 'boolean') {
      throw new TypeError(`non-boolean Timeline selection: ${key}`);
    }
    prior.timeline = prior.timeline === true;
    if (prior.timeline) selected.push(key);
    overrides[key] = prior;
  }
  trip.thingOverrides = overrides;
  const payload = Buffer.from(JSON.stringify(trip));
  return {
    payload,
    timelineReplay: {
      policy: 'timeline-explicit-v1',
      source_fixture_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      served_payload_sha256: crypto.createHash('sha256').update(payload).digest('hex'),
      selected_place_keys: selected.sort(),
    },
  };
}
