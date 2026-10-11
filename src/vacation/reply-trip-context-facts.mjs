import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';
import { applyPlaceSearchReplyFacts } from './place-search-reply-facts.mjs';
import { statedLodgingLabelFromThings } from './intake-shared-trip.mjs';
import { tripLodgingFieldsFromThings } from './lodging-anchor.mjs';
import { chatPlaceSearchSavedReplyFacts } from './chat-place-search-when.mjs';
import { applyInTurnCitablePlaces, tripOwnedPlaceAllowRows, turnNamedSearchAwayFromStatedLodging } from './provider-result-context.mjs';
import { tripIsoDay } from './intake-weekday-dates.mjs';
import {
  applyPendingInviteReplyFacts,
  loadPendingCollaboratorInvites,
  pendingInviteReplyFacts,
} from './roster-pending-invite-reply-facts.mjs';

function isoDay(value) {
  return tripIsoDay(value);
}

function itineraryTitle(line) {
  return String(line || '').split(':')[0].replace(/\s+/g, ' ').trim();
}

function itineraryHasStatus(line) {
  const text = String(line || '');
  const colon = text.indexOf(':');
  return colon >= 0 && text.slice(colon + 1).trim().length > 0;
}

function applyTripReplyGate(ctx, things, inTurnPlaceResults) {
  if (!ctx || typeof ctx !== 'object' || !Array.isArray(inTurnPlaceResults) || !inTurnPlaceResults.length) return ctx;
  const lodgingCtx = ctx.customerOwnLodgingContext && typeof ctx.customerOwnLodgingContext === 'object'
    ? ctx.customerOwnLodgingContext
    : null;
  const searchArea = String(ctx.searchArea || '').trim();
  const statedLodgingArea = String(ctx.statedLodgingArea || lodgingCtx?.statedLodgingArea || '').trim();
  if (turnNamedSearchAwayFromStatedLodging(ctx)) {
    return {
      ...ctx,
      tripReplyGate: tripOwnedPlaceAllowRows({
        tripResolvedArea: searchArea,
      }),
    };
  }
  return {
    ...ctx,
    tripReplyGate: tripOwnedPlaceAllowRows({
      destination: String(ctx.destination || '').trim(),
      lodging: String(ctx.lodging || lodgingCtx?.lodging || '').trim(),
      tripStatedLodgingArea: statedLodgingArea,
      tripResolvedArea: searchArea || String(ctx.searchArea || '').trim(),
      things,
    }),
  };
}

function applyUnscheduledDayStatus(ctx) {
  if (!ctx || typeof ctx !== 'object' || !Array.isArray(ctx.itinerary)) return ctx;
  const search = ctx.chatPlaceSearch;
  const rows = Array.isArray(search?.unscheduled) ? search.unscheduled : [];
  if (!rows.length) return ctx;
  const hasStatus = new Set();
  for (const item of ctx.itinerary) {
    if (typeof item !== 'string' || !itineraryHasStatus(item)) continue;
    const title = itineraryTitle(item).toLowerCase();
    if (title) hasStatus.add(title);
  }
  const unscheduled = rows.filter((row) => {
    if (row?.weekdayAmbiguous === true) return true;
    if (row?.notOnADay !== true) return true;
    const title = String(row?.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return !title || !hasStatus.has(title);
  });
  let changed = unscheduled.length !== rows.length;
  const itinerary = ctx.itinerary.map((item) => {
    if (typeof item !== 'string' || itineraryHasStatus(item)) return item;
    const title = itineraryTitle(item);
    const key = title.toLowerCase();
    if (!title || hasStatus.has(key)) return item;
    const row = unscheduled.find((entry) => String(entry?.title || '').replace(/\s+/g, ' ').trim().toLowerCase() === key);
    if (!row || row.notOnADay !== true || row.weekdayAmbiguous === true) return item;
    changed = true;
    return `${title}: not on a day`;
  });
  if (!changed) return ctx;
  const chatPlaceSearch = { ...search, unscheduled };
  delete chatPlaceSearch.unscheduledDayRule;
  const next = { ...ctx, itinerary, chatPlaceSearch };
  delete next.unscheduledDayRule;
  return next;
}

export function applySavedJobDatesToReplyFacts(facts, { savedStart = '', savedEnd = '' } = {}) {
  if (!facts || typeof facts !== 'object') return facts;
  const start = isoDay(savedStart);
  const end = isoDay(savedEnd);
  if (!start && !end) return facts;
  const out = { ...facts };
  if (start) out.start = start;
  if (end) out.end = end;
  const when = [start, end].filter(Boolean).join(' to ');
  if (when) out.when = when;
  if (when && !String(out.dates || '').trim()) {
    out.dates = `Saved trip dates: ${when}.`;
  }
  return out;
}

function inTurnSavedPlaceReplyFacts(things, inTurnPlaceResults, tripStart, tripEnd) {
  if (!Array.isArray(inTurnPlaceResults) || !inTurnPlaceResults.length) return null;
  const inTurnTitles = new Set();
  for (const row of inTurnPlaceResults) {
    const title = String(row?.title || row?.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (title) inTurnTitles.add(title);
  }
  if (!inTurnTitles.size) return null;
  const savedRows = (Array.isArray(things) ? things : []).flatMap((thing) => {
    const title = String(thing?.title || '').replace(/\s+/g, ' ').trim();
    if (!title || !inTurnTitles.has(title.toLowerCase())) return [];
    return [{
      title,
      whenLabel: String(thing?.whenLabel || '').trim(),
      customerWhen: String(thing?.customerWhen || '').trim(),
    }];
  });
  if (!savedRows.length) return null;
  return chatPlaceSearchSavedReplyFacts(savedRows, tripStart, tripEnd);
}

function chatExtractionReplyFacts(wantedThings, tripStart, tripEnd) {
  const rows = (Array.isArray(wantedThings) ? wantedThings : []).flatMap((thing) => {
    const title = String(thing?.title || thing?.name || '').trim();
    if (!title) return [];
    const source = String(thing?.source || '').trim();
    if (source && source !== 'chat_extraction') return [];
    return [{
      title,
      whenLabel: String(thing?.whenLabel || thing?.when || '').trim(),
      customerWhen: String(thing?.customerWhen || '').trim(),
    }];
  });
  if (!rows.length) return null;
  return chatPlaceSearchSavedReplyFacts(rows, tripStart, tripEnd);
}

function statedLodgingAreaFromTripMetadata(meta = {}) {
  const row = meta && typeof meta === 'object' ? meta : {};
  return String(row.statedLodgingArea || row.statedLodgingAreaHint || '').trim().slice(0, 240);
}

export async function loadTripMetadataStatedLodgingArea(db, tripId) {
  const id = String(tripId || '').trim();
  if (!db || !id) return '';
  const trips = await db`select metadata from trips where id = ${id} limit 1`;
  const meta = trips[0]?.metadata && typeof trips[0].metadata === 'object' ? trips[0].metadata : {};
  return statedLodgingAreaFromTripMetadata(meta);
}

export async function draftingLodgingFields(ctx, { things = [], db = null, tripId = '' } = {}) {
  let next = ctx && typeof ctx === 'object' ? { ...ctx } : {};
  const fromThings = tripLodgingFieldsFromThings(things);
  if (!String(next.lodging || '').trim()) {
    const label = statedLodgingLabelFromThings(things) || fromThings.lodging;
    if (label) next.lodging = label;
  }
  if (!String(next.statedLodgingArea || '').trim()) {
    const area = fromThings.statedLodgingArea || await loadTripMetadataStatedLodgingArea(db, tripId);
    if (area) next.statedLodgingArea = area;
  }
  return next;
}

export async function enrichDraftingTripContext(tripContext, {
  things = [],
  session = null,
  env = process.env,
  turnActionResults = null,
  placeSearchReplyFacts = null,
  savedStart = '',
  savedEnd = '',
  wantedThings = null,
  inTurnPlaceResults = null,
} = {}) {
  let ctx = applySavedJobDatesToReplyFacts(tripContext, { savedStart, savedEnd });
  ctx = applyTurnInviteReplyFacts(ctx, turnActionResults);
  ctx = applyPlaceSearchReplyFacts(ctx, placeSearchReplyFacts);
  if (!ctx.chatPlaceSearch) {
    ctx = applyPlaceSearchReplyFacts(ctx, chatExtractionReplyFacts(wantedThings, savedStart, savedEnd));
  }
  if (!ctx.chatPlaceSearch) {
    ctx = applyPlaceSearchReplyFacts(ctx, inTurnSavedPlaceReplyFacts(things, inTurnPlaceResults, savedStart, savedEnd));
  }
  const tripId = String(session?.trip_id || session?.tripId || '').trim();
  let db = null;
  if (env?.DATABASE_URL && session?.customer_id) {
    try {
      const { sql } = await import('./db.mjs');
      db = sql(env);
    } catch {
      db = null;
    }
  }
  ctx = await draftingLodgingFields(ctx, { things, db, tripId });
  ctx = applyInTurnCitablePlaces(ctx, inTurnPlaceResults, things);
  if (!db || !session?.customer_id) {
    return applyUnscheduledDayStatus(applyTripReplyGate(ctx, things, inTurnPlaceResults));
  }
  try {
    const pendingRows = await loadPendingCollaboratorInvites(db, {
      ownerCustomerId: session.customer_id,
      tripId,
      onboardingSessionId: session?.id || '',
    });
    return applyUnscheduledDayStatus(applyTripReplyGate(applyPendingInviteReplyFacts(ctx, pendingInviteReplyFacts(pendingRows)), things, inTurnPlaceResults));
  } catch {
    return applyUnscheduledDayStatus(applyTripReplyGate(ctx, things, inTurnPlaceResults));
  }
}
