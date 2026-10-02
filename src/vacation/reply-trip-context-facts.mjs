import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';
import { applyPlaceSearchReplyFacts } from './place-search-reply-facts.mjs';
import { statedLodgingLabelFromThings } from './intake-shared-trip.mjs';
import {
  applyPendingInviteReplyFacts,
  loadPendingCollaboratorInvites,
  pendingInviteReplyFacts,
} from './roster-pending-invite-reply-facts.mjs';

export async function enrichDraftingTripContext(tripContext, {
  things = [],
  session = null,
  env = process.env,
  turnActionResults = null,
  placeSearchReplyFacts = null,
} = {}) {
  let ctx = applyTurnInviteReplyFacts(tripContext, turnActionResults);
  ctx = applyPlaceSearchReplyFacts(ctx, placeSearchReplyFacts);
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
