import { createHash } from 'node:crypto';
import { intakeShareSlug, intId, sharedTripFromIntake, thingRecordFromTripRow } from './intake-shared-trip.mjs';
import { shareSlugEditGuardDecision } from './chat-itinerary-edit-slug-guard.mjs';
import { finalizeServedSharedTripPayload } from './shared-trip-served-page.mjs';
import { normalizeThingType } from './timeline-icons.mjs';

export const tripItemKinds = new Set(['hotel', 'park', 'activity', 'meal', 'restaurant', 'flight_option', 'ground_ride', 'other']);

export function digestTripState(value) {
  const hash = createHash('sha256');
  function encode(entry) {
    if (Array.isArray(entry)) return entry.map(encode);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, encode(entry[key])]));
    }
    return entry;
  }
  return hash.update(JSON.stringify(encode(value))).digest('hex');
}

export function tripStateBacking(trip) {
  const meta = trip?.metadata || {};
  const slug = meta.sharedToken || meta.shareToken || meta.publicSlug || meta.source_token || meta.slug;
  const expected = intakeShareSlug(trip?.id);
  const available = meta.intakeShare === true || meta.intakeShare === 'true' || trip?.status === 'onboarding';
  return expected && available && (!slug || slug === expected) ? 'intake' : 'trek';
}

export function tripStateSiteLocked(trip) {
  const meta = trip?.metadata || {};
  const slug = meta.sharedToken || meta.shareToken || meta.publicSlug || meta.source_token || meta.slug || intakeShareSlug(trip?.id);
  return !shareSlugEditGuardDecision(slug).ok || ['archived', 'cancelled'].includes(trip?.status);
}

export function withoutPreviousSystemPlan(site, planKey) {
  return {
    ...site,
    things: site.things.map((thing) => {
      const info = thing.metadata?.tripState;
      const obsolete = (row) => row.plan_key && row.plan_key !== planKey && row.proposed_by === 'system';
      if (!info?.occurrences?.some(obsolete)) return thing;
      const removed = new Set(info.occurrences.filter(obsolete).map(({ id }) => id));
      const next = {
        ...info,
        occurrences: info.occurrences.filter((row) => !obsolete(row)).map((row) => {
          if (!removed.has(row.before)) return row;
          const { before, ...kept } = row;
          return kept;
        }),
      };
      if (info.stay?.plan_key && info.stay.plan_key !== planKey) delete next.stay;
      return { ...thing, metadata: { ...thing.metadata, tripState: next } };
    }),
  };
}

function itemType(row, place) {
  const recorded = row.metadata?.tripState?.type;
  if (tripItemKinds.has(recorded)) return recorded;
  const category = String(row.category || '').trim().toLowerCase();
  if (tripItemKinds.has(category)) return category;
  const kind = normalizeThingType(place.category_name) || normalizeThingType(category);
  if (kind === 'flight') return 'flight_option';
  if (['car', 'transport'].includes(kind)) return 'ground_ride';
  if (['attraction', 'tour', 'sightseeing', 'event'].includes(kind)) return 'activity';
  return tripItemKinds.has(kind) ? kind : 'other';
}

function legacyTime(row, overrides) {
  const value = overrides?.perDaySchedule?.[String(row.day_id)]?.startTime || row.place?.place_time;
  if (!value || String(value).length > 40) return null;
  return { value: String(value), precision: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? 'exact' : 'window' };
}

export function readTripStateSite(site, previous, turn) {
  const { trip, things, invites } = site;
  const payload = finalizeServedSharedTripPayload(sharedTripFromIntake({ trip, things: things.map(thingRecordFromTripRow) }));
  const stamp = { via: 'legacy_site', turn };
  const items = {}, days = {}, lodging = {}, flights = {}, ground = {};
  const byPlace = new Map(things.map((row) => [String(intId(row.id)), row]));
  for (const place of payload.places) {
    const key = String(place.id);
    const row = byPlace.get(key);
    const info = row.metadata?.tripState || {};
    const prior = previous?.items?.[key];
    items[key] = {
      title: place.name.slice(0, 280), type: itemType(row, place), basis: info.basis || 'legacy',
      ...(info.candidate_id ? { candidate_id: info.candidate_id } : {}),
      via: info.via || prior?.via || stamp.via, turn: info.turn || prior?.turn || turn,
    };
    if (info.stay) lodging[key] = info.stay;
    if (info.flight) flights[key] = info.flight;
    if (info.ride) ground[key] = info.ride;
  }
  const assigned = new Set();
  for (const day of payload.days) {
    const key = String(day.id);
    const previousDay = previous?.days?.[key];
    const rows = (payload.assignments[key] || []).map((row) => {
      const id = String(row.id);
      const item = String(row.place_id);
      const explicit = row.tripStateTurn != null;
      const prior = previousDay?.assigned.find((entry) => entry.id === id);
      assigned.add(item);
      return {
        id, item, type: items[item].type, role: row.role || 'visit',
        time: explicit ? row.tripStateTime : legacyTime(row, payload.thingOverrides[`place:${item}`]),
        ...(row.tripStateProposedBy ? { proposed_by: row.tripStateProposedBy } : {}),
        via: explicit ? row.tripStateVia : prior?.via || stamp.via,
        turn: explicit ? row.tripStateTurn : prior?.turn || turn,
      };
    });
    days[key] = { date: day.date, assigned: rows, via: previousDay?.via || stamp.via, turn: previousDay?.turn || turn };
  }
  for (const [item, stay] of Object.entries(lodging)) {
    const { plan_key, ...details } = stay;
    lodging[item] = {
      ...details,
      check_in: days[stay.check_in]?.assigned.some((row) => row.item === item && row.role === 'check_in') ? stay.check_in : null,
      check_out: days[stay.check_out]?.assigned.some((row) => row.item === item && row.role === 'check_out') ? stay.check_out : null,
    };
  }
  return {
    site_revision: digestTripState({ header: payload.trip, days: payload.days, things, invites }),
    read: 'current',
    trip: {
      title: payload.trip.title.slice(0, 280) || null, destination: payload.trip.description.slice(0, 280) || null,
      start: payload.trip.start_date, end: payload.trip.end_date, via: previous?.trip?.via || stamp.via,
      turn: previous?.trip?.turn || turn,
    },
    items, days, lodging, flights, ground, unassigned: Object.keys(items).filter((key) => !assigned.has(key)),
    collaborators: previous?.collaborators || {}, invites: { ...previous?.invites, ...invites },
  };
}
