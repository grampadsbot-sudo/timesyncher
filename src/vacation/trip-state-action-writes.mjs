import { randomUUID } from 'node:crypto';
import { findPlaceAssignment, placeAssignmentsOnDay } from './chat-itinerary-edit-assignment.mjs';
import { intId } from './intake-shared-trip.mjs';
import { digestTripState, tripItemKinds } from './trip-state-action-site.mjs';
import { actionFailure, hasExplicitAccessGrant, itemEvidence, typedItemDetails, validatedTime, validTripStateId } from './trip-state-action-input.mjs';
import { isTripThingName, normalizeTripThingName } from './trip-thing-name-shape.mjs';

const needs = (detail) => actionFailure('needs_info', detail);
const conflict = (detail) => actionFailure('conflict', detail);
const denied = (detail) => actionFailure('denied', detail);
const changed = (refs, item) => ({ result: 'applied', detail: 'Verified requested site changes.', refs, item });
const unchanged = (refs, item) => ({ result: 'no_change', detail: 'Requested site targets already match.', refs, item });
const equal = (a, b) => digestTripState(a) === digestTripState(b);

function storedThing(site, item) {
  return site.things.find((row) => String(intId(row.id)) === item);
}

function savedOccurrences(saved, item) {
  return Object.entries(saved.days).flatMap(([day, { assigned }]) => assigned.flatMap((row, index) => {
    if (row.item !== item) return [];
    const { id, role, time, turn, via, proposed_by } = row;
    const before = assigned[index + 1]?.id;
    return [{ id, day, role, time, via, turn, ...(proposed_by ? { proposed_by } : {}), ...(before ? { before } : {}) }];
  }));
}

function saveOccurrences(site, item, rows) {
  const thing = storedThing(site, item);
  const metadata = { ...thing.metadata };
  delete metadata.customerWhen;
  delete metadata.whenLabel;
  metadata.tripState = { ...metadata.tripState, occurrences: rows };
  thing.metadata = metadata;
}

function persistItem(site, row, type, label, info) {
  if (!row) {
    row = { id: randomUUID(), category: type, title: label, metadata: {}, source: 'customer' };
    site.things.push(row);
  }
  row.title = label;
  row.metadata = {
    ...row.metadata,
    ...(type === 'hotel' ? { customerStatedLodging: true } : {}),
    tripState: { ...row.metadata.tripState, ...info, type },
  };
  return String(intId(row.id));
}

function matchingItems(saved, args, details) {
  const name = normalizeTripThingName(args.label);
  const sameName = Object.entries(saved.items).filter(([, item]) => normalizeTripThingName(item.title) === name);
  const sameType = sameName.filter(([key, item]) => item.type === args.type
    && (!details.flight || !saved.flights[key] || saved.flights[key].direction === details.flight.direction));
  return { sameType, wrongType: sameName.some(([, item]) => item.type !== args.type) };
}

function newNamedItem(site, saved, context, args) {
  const basis = itemEvidence(context, args);
  if (!basis) return denied('A customer place or approved plan block is required.');
  const details = typedItemDetails(args.type, args.details, context);
  if (!details) return needs('Supply the grounded details for this item type.');
  const { sameType, wrongType } = matchingItems(saved, args, details);
  if (wrongType) return conflict('The matching site item has a different type.');
  if (sameType.length > 1) return needs('Identify the exact existing site item.');
  const existing = sameType[0]?.[0];
  if (existing) return unchanged([existing], existing);
  const id = persistItem(site, null, args.type, args.label.trim(), {
    via: 'customer_named', turn: context.turn, basis, ...details,
  });
  return changed([id], id);
}

function visitOnDay(site, saved, context, args, requireExisting = false) {
  const { item, day, before, move, occurrence } = args;
  const entity = Object.hasOwn(saved.items, item) && saved.items[item];
  if (!entity || !Object.hasOwn(saved.days, day)) return needs('Identify an existing item and a day on this trip.');
  if (!isTripThingName(entity.title)) return denied('The existing item needs a valid name.');
  const assignments = Object.fromEntries(Object.entries(saved.days).map(([key, value]) => [key, value.assigned]));
  const onDay = placeAssignmentsOnDay({ assignments }, item, day);
  const role = args.role ?? (requireExisting && (move ? onDay.find((entry) => entry.id === move)?.role
    : onDay.length === 1 ? onDay[0].role : undefined));
  if (!role) return needs('Identify which occurrence role to update.');
  const permitted = entity.type === 'hotel' ? ['visit', 'check_in', 'check_out']
    : entity.type === 'flight_option' ? ['leg'] : entity.type === 'ground_ride' ? ['ride'] : ['visit'];
  if (!permitted.includes(role)) return conflict('The occurrence role does not match the item type.');
  if ([before, move, occurrence].some((value) => value != null && !validTripStateId(value))) return needs('Identify an occurrence on this trip.');
  const row = storedThing(site, item);
  const rows = row.metadata?.tripState?.occurrences || savedOccurrences(saved, item);
  const sameRole = onDay.filter((entry) => entry.role === role);
  if (!move && !occurrence && sameRole.length > 1) return needs('Identify which occurrence to update.');
  const source = move && findPlaceAssignment({ assignments }, item, (entry) => entry.id === move);
  const current = move ? rows.find((entry) => entry.id === source?.assignmentId)
    : occurrence ? rows.find((entry) => entry.selector === occurrence && entry.day === day && entry.role === role)
      : rows.find((entry) => entry.id === sameRole[0]?.id);
  if (move && (!current || current.role !== role || (occurrence && current.selector !== occurrence))) return conflict('The source occurrence no longer matches.');
  if (requireExisting && current?.day !== day) return needs('Identify the existing occurrence to time on this day.');
  if (['check_in', 'check_out'].includes(role) && (!current || current.day !== day)) return needs('Use set_stay to change the stay endpoints.');
  if (before && (before === current?.id || !saved.days[day].assigned.some((entry) => entry.id === before))) return needs('Identify a different order anchor on the target day.');
  const explicit = site.things.flatMap((thing) => thing.metadata?.tripState?.occurrences || []);
  const anchors = new Map([...explicit, ...rows].filter((entry) => entry.day === day).map((entry) => [entry.id, entry.before]));
  const visited = new Set([current?.id]);
  for (let anchor = before; anchor; anchor = anchors.get(anchor)) {
    if (visited.has(anchor)) return conflict('The requested order creates a cycle.');
    visited.add(anchor);
  }
  const time = args.time === undefined ? current?.time || null : validatedTime(context, args.time, args.time_evidence, !requireExisting);
  if (time === undefined || (requireExisting && !time)) return denied('Supply a valid proposed clock time or a time supported by customer wording.');
  const anchor = before || (current?.day === day ? current.before : undefined);
  const system = context.authority.source === 'system_plan';
  const samePlacement = current?.day === day && equal(current.time, time) && anchor === current.before;
  if (samePlacement && (system || current.proposed_by !== 'system')) return unchanged([current.id], item);
  if (system && current && current.proposed_by !== 'system') return denied('Customer or existing site placements take precedence.');
  const id = current?.id || String(intId(randomUUID()));
  const selector = occurrence || current?.selector;
  const next = { id, day, role, time, turn: context.turn, proposed_by: system ? 'system' : 'customer',
    ...(anchor ? { before: anchor } : {}), ...(selector ? { selector } : {}) };
  saveOccurrences(site, item, current ? rows.map((entry) => entry.id === id ? next : entry) : [...rows, next]);
  return changed([id], item);
}

function saveStay(site, saved, context, args) {
  const { hotel, check_in, check_out } = args;
  if (!Object.hasOwn(saved.items, hotel) || !Object.hasOwn(saved.days, check_in) || !Object.hasOwn(saved.days, check_out)) return needs('Identify the hotel and both stay days on this trip.');
  if (saved.items[hotel].type !== 'hotel') return conflict('The existing item is not a hotel.');
  if (!isTripThingName(saved.items[hotel].title)) return denied('The existing hotel needs a valid name.');
  if (saved.days[check_in].date > saved.days[check_out].date) return conflict('Check-out falls before check-in.');
  const row = storedThing(site, hotel);
  const info = row.metadata?.tripState;
  if (info?.stay?.turn > context.turn) return conflict('A later turn already updated this stay.');
  const rows = info?.occurrences || savedOccurrences(saved, hotel);
  const next = [...rows];
  const refs = [], updated = [];
  for (const role of ['check_in', 'check_out']) {
    const day = args[role];
    const matching = next.filter((entry) => entry.role === role);
    if (matching.length > 1) return conflict('Multiple existing stay endpoints need reconciliation.');
    const current = matching[0];
    const time = args[`${role}_time`] === undefined ? current?.time || null
      : validatedTime(context, args[`${role}_time`], args[`${role}_evidence`]);
    if (time === undefined) return denied('The requested stay time needs matching customer wording.');
    const id = current?.id || String(intId(randomUUID()));
    refs.push(id);
    if (current?.day === day && equal(time, current.time)) continue;
    const occurrence = { id, day, role, time, turn: context.turn };
    if (current) next[next.indexOf(current)] = occurrence;
    else next.push(occurrence);
    updated.push(id);
  }
  if (!updated.length && info?.stay?.check_in === check_in && info.stay.check_out === check_out) return unchanged(refs, hotel);
  saveOccurrences(site, hotel, next);
  row.metadata.tripState.stay = { check_in, check_out, via: 'chat_action', turn: context.turn };
  return changed([hotel, ...updated], hotel);
}

function promoteSearch(site, saved, context, args) {
  const { candidate, day, role, time, time_evidence, replace_hotel: replacement } = args;
  const system = context.authority.source === 'system_plan';
  if (!validTripStateId(candidate) || (!system && !context.authority.selectedCandidates?.includes(candidate))) {
    return needs('Identify an authorized search candidate.');
  }
  if (time != null && (day == null || role == null)) return needs('Supply a day and role for the time.');
  const selection = context.state.candidates?.[candidate];
  const scoped = context.state.research?.key && context.authority.researchKey === context.state.research.key;
  if (replacement && (!Object.hasOwn(saved.items, replacement) || saved.items[replacement].type !== 'hotel')) return conflict('The replacement target is not an existing hotel.');
  if (!scoped && (system || !selection)) return conflict('The selected candidate is outside the current search scope.');
  const existing = Object.entries(saved.items).find(([, item]) => item.candidate_id === candidate)?.[0];
  if (existing && !isTripThingName(saved.items[existing].title)) return denied('The existing item needs a valid name.');
  let item = existing;
  let created = false;
  if (replacement && item && replacement !== item) return conflict('The selected candidate is already saved as another item.');
  if (!item) {
    if (!scoped || selection?.source !== 'vk_search' || !validTripStateId(selection.result_id)
      || !tripItemKinds.has(selection.type)
      || !context.state.research.areas.some((area) => normalizeTripThingName(area) === normalizeTripThingName(selection.area))) {
      return conflict('The selected candidate is outside the current search scope.');
    }
    const { result_id: providerId, type, title } = selection;
    if (!isTripThingName(title)) return denied('The selected search result needs a valid place name.');
    const provider = site.things.find((row) => row.metadata?.tripState?.provider === providerId);
    if (provider) item = String(intId(provider.id));
    const { sameType, wrongType } = matchingItems(saved, { type, label: title }, {});
    if (wrongType || (provider && saved.items[item]?.type !== type)) return conflict('The matching site item has a different type.');
    if (!item && !replacement && sameType.length > 1) return needs('Identify the exact existing site item.');
    if (!item && !replacement && sameType.length === 1) {
      const named = sameType[0][0];
      if (!storedThing(site, named).metadata?.tripState?.provider) item = named;
    }
    if (replacement && (type !== 'hotel' || saved.items[replacement].basis !== 'placeholder'
      || (item && item !== replacement) || sameType.some(([key]) => key !== replacement))) return conflict('Select an unambiguous hotel placeholder to enrich.');
    const target = item || replacement;
    if (provider && !replacement) {
      item = String(intId(provider.id));
    } else {
      item = persistItem(site, target ? storedThing(site, target) : null, type, title, {
        via: 'search', turn: context.turn, basis: 'verified_place', candidate_id: candidate, provider: providerId,
      });
      created = true;
    }
  }
  if (day != null || role != null) {
    const place = visitOnDay(site, { ...saved, items: { ...saved.items, [item]: saved.items[item] || { type: selection.type, title: selection.title } } },
      context, { item, day, role, time, time_evidence });
    if (place.result !== 'applied' && place.result !== 'no_change') return place;
    return created || place.result === 'applied' ? changed([item, ...place.refs], item) : unchanged([item, ...place.refs], item);
  }
  return created ? changed([item], item) : unchanged([item], item);
}

function holdInvite(site, saved, context, args) {
  const { name, access } = args;
  if (typeof name !== 'string' || name.length > 280 || !['view', 'edit', 'collaborator'].includes(access)) return needs('Supply a name and access level.');
  if (!hasExplicitAccessGrant(context, name, access)) return denied('An explicit access request from the owner is required.');
  const id = `hold-${digestTripState([context.tripId, normalizeTripThingName(name)]).slice(0, 40)}`;
  if (site.invites[id]?.turn > context.turn) return conflict('A later turn already updated this held invite.');
  if (site.invites[id]?.access === access) return unchanged([id]);
  site.invites[id] = { name: name.trim(), access, status: 'held', via: 'chat_action', turn: context.turn };
  return changed([id]);
}

export const siteActionWriters = {
  place_on_day: visitOnDay,
  set_time: (site, saved, context, args) => visitOnDay(site, saved, context, args, true),
  set_stay: saveStay,
  add_named_item: newNamedItem,
  add_from_search: promoteSearch,
  hold_invite: holdInvite,
};
