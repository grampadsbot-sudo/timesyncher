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

function inTurnPlaceReplyCarry(tripContext) {
  return { tripContext, tripPlaceAllowRows: tripContext?.tripReplyGate };
}

function tieredReplyTimeoutForInTurn(enforceInTurnPlaces, env = process.env) {
  return enforceInTurnPlaces ? placeSearchTieredReplyTimeoutMs(env) : 0;
}

function recoverInTurnPlaceAfterBannedReply({
  reply,
  banned,
  model,
  enforceInTurnPlaces,
  inTurnProviderResults,
  carry,
  failureBase,
}) {
  if (reply && !banned) return { continue: true, reply, banned, model };
  const recovered = finalizeInTurnPlaceShipReply(reply, enforceInTurnPlaces, inTurnProviderResults, carry);
  if (recovered.ok && recovered.reply) {
    const nextModel = model && typeof model === 'object'
      ? { ...model, usedInTurnPlaceFallback: recovered.usedFallback === true }
      : model;
    return { continue: true, reply: recovered.reply, banned: '', model: nextModel };
  }
  return {
    continue: false,
    result: {
      reply: null,
      ...failureBase,
      model,
      reason: banned || model?.reason || 'live dispatcher returned no reply',
      ...(recovered.blocked || {}),
    },
  };
}

/** @returns {string|object} reply text, or blocked carry-through object */
function shipInTurnPlaceSearchDraft(draft, enforceInTurnPlaces, inTurnPlaceResults, carry) {
  const ship = finalizeInTurnPlaceShipReply(draft, enforceInTurnPlaces, inTurnPlaceResults, carry);
  if (!ship.ok) return ship.blocked;
  return ship.reply;
}

function applyInTurnRewriteShipGate(shippedText, pending, log, carry = {}) {
  if (!pending.enforceInTurnPlaces) return { shippedText };
  const rewriteShip = finalizeInTurnPlaceShipReply(shippedText, true, pending.inTurnPlaceResults, {
    ...carry,
    tripContext: pending.tripContext,
    tripPlaceAllowRows: pending.tripContext?.tripReplyGate,
    log: { ...log, held: true },
  });
  if (!rewriteShip.ok) {
    return {
      blocked: {
        ...rewriteShip.blocked,
        log: { ...log, rewriteFailReason: rewriteShip.blocked?.reason, held: true },
      },
    };
  }
  return { shippedText: rewriteShip.reply };
}

export function inTurnPlaceLiveReplyHooks(tripContext, enforceInTurnPlaces, env = process.env) {
  const carry = inTurnPlaceReplyCarry(tripContext);
  return {
    timeoutMs: tieredReplyTimeoutForInTurn(enforceInTurnPlaces, env),
    recoverBanned: ({ reply, banned, model, inTurnProviderResults, failureBase }) => recoverInTurnPlaceAfterBannedReply({
      reply,
      banned,
      model,
      enforceInTurnPlaces,
      inTurnProviderResults,
      carry,
      failureBase,
    }),
    shipDraft: (draft, inTurnProviderResults, extra = {}) => shipInTurnPlaceSearchDraft(
      draft,
      enforceInTurnPlaces,
      inTurnProviderResults,
      { ...extra, ...carry },
    ),
    rewriteGate: (shippedText, pending, log, extra = {}) => applyInTurnRewriteShipGate(shippedText, pending, log, extra),
  };
}
