import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';
import { applyPlaceSearchReplyFacts } from './place-search-reply-facts.mjs';
import { statedLodgingLabelFromThings } from './intake-shared-trip.mjs';
import { chatPlaceSearchSavedReplyFacts } from './chat-place-search-when.mjs';
import { applyInTurnCitablePlaces } from './provider-result-context.mjs';
import { tripIsoDay } from './intake-weekday-dates.mjs';
import {
  applyPendingInviteReplyFacts,
  loadPendingCollaboratorInvites,
  pendingInviteReplyFacts,
} from './roster-pending-invite-reply-facts.mjs';

function isoDay(value) {
  return tripIsoDay(value);
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
  const unscheduledRule = String(ctx.chatPlaceSearch?.unscheduledDayRule || '').trim();
  if (unscheduledRule) ctx = { ...ctx, unscheduledDayRule: unscheduledRule };
  ctx = applyInTurnCitablePlaces(ctx, inTurnPlaceResults);
  if (!ctx.lodging) {
    const label = statedLodgingLabelFromThings(things);
    if (label) ctx.lodging = label;
  }
  if (!env?.DATABASE_URL || !session?.customer_id) return ctx;
  try {
    const { sql } = await import('./db.mjs');
    const db = sql(env);
    const tripId = session?.trip_id || session?.tripId || '';
    if (tripId && !ctx.lodging) {
      const trips = await db`select metadata from trips where id = ${tripId} limit 1`;
      const meta = trips[0]?.metadata && typeof trips[0].metadata === 'object' ? trips[0].metadata : {};
      const area = String(meta.statedLodgingArea || meta.statedLodgingAreaHint || '').trim();
      if (area) ctx.lodging = area.slice(0, 240);
    }
    const pendingRows = await loadPendingCollaboratorInvites(db, {
      ownerCustomerId: session.customer_id,
      tripId,
      onboardingSessionId: session?.id || '',
    });
    return applyPendingInviteReplyFacts(ctx, pendingInviteReplyFacts(pendingRows));
  } catch {
    return ctx;
  }
}
