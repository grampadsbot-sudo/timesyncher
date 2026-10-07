import { citablePlaceTitles, tripOwnedPlaceAllowRows } from './provider-result-context.mjs';
import { blockInTurnPlaceReply, inTurnPlaceReplyViolation } from './chat-place-search.mjs';

/** Leave headroom after classifier + place search inside the 60s itinerary route. */
export const PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS = 28_000;

function parsePositiveIntEnv(env, key, defaultValue) {
  const text = String(env?.[key] ?? '').trim();
  if (!text) return defaultValue;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

export function placeSearchTieredReplyTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env, 'PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS', PLACE_SEARCH_TIERED_REPLY_TIMEOUT_MS);
}

export function inTurnPlaceGroundedFallbackReply(tripContext, inTurnPlaceResults = []) {
  const fromCtx = Array.isArray(tripContext?.citablePlaces) ? tripContext.citablePlaces : [];
  const names = (fromCtx.length ? fromCtx : citablePlaceTitles(inTurnPlaceResults))
    .map((name) => String(name || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!names.length) return '';
  const area = String(tripContext?.searchArea || tripContext?.destination || '').trim();
  const prefix = area ? `Near ${area}, ` : '';
  if (names.length === 1) {
    return `${prefix}${names[0]} came up in this search.`;
  }
  const last = names[names.length - 1];
  const lead = names.slice(0, -1).join(', ');
  return `${prefix}${lead}, and ${last} came up in this search.`;
}

function tripPlaceAllowRowsFromCarry(carry = {}) {
  if (Array.isArray(carry.tripPlaceAllowRows) && carry.tripPlaceAllowRows.length) {
    return carry.tripPlaceAllowRows;
  }
  return tripOwnedPlaceAllowRows(carry.tripContext?.tripReplyGate || {});
}

function groundedShipCandidate(reply, inTurnPlaceResults, tripPlaceAllowRows) {
  const text = String(reply || '').trim();
  if (!text) return null;
  const violation = inTurnPlaceReplyViolation(text, inTurnPlaceResults, { tripPlaceAllowRows });
  return violation ? null : text;
}

/**
 * Ship an in-turn place-search reply, or a deterministic grounded fallback when the model
 * draft is empty, times out, or cites saved trip context (e.g. rental cars).
 */
export function finalizeInTurnPlaceShipReply(reply, enforceInTurnPlaces, inTurnPlaceResults, carry = {}) {
  if (!enforceInTurnPlaces) {
    const text = String(reply || '').trim();
    return text ? { ok: true, reply: text } : { ok: false, reason: 'app reply text is empty' };
  }
  const tripPlaceAllowRows = tripPlaceAllowRowsFromCarry(carry);
  const direct = groundedShipCandidate(reply, inTurnPlaceResults, tripPlaceAllowRows);
  if (direct) return { ok: true, reply: direct };
  const fallback = inTurnPlaceGroundedFallbackReply(carry.tripContext, inTurnPlaceResults);
  const fromFallback = groundedShipCandidate(fallback, inTurnPlaceResults, tripPlaceAllowRows);
  if (fromFallback) {
    return { ok: true, reply: fromFallback, usedFallback: true };
  }
  const blocked = blockInTurnPlaceReply(
    String(reply || '').trim() || fallback || ' ',
    true,
    inTurnPlaceResults,
    { ...carry, tripPlaceAllowRows },
  );
  return { ok: false, blocked };
}
