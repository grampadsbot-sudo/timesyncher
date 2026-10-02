const INVITE_SUCCESS_CLAIM = /\b(?:i(?:'|')ve|i have|we(?:'|')ve|we have)\s+(?:added|invited)\b/i;
const INVITE_SENT_CLAIM = /\bsent\s+(?:the\s+)?invite\b/i;
const SHARED_WITH_CLAIM = /\bshared\s+(?:this\s+)?(?:trip|itinerary|plan|site)\s+with\b/i;
const ADDED_COLLABORATOR_CLAIM = /\badded\s+.{1,120}\s+as\s+(?:a\s+)?collaborator\b/i;
const VIEW_ACCESS_CLAIM = /\b(?:can now view|can view (?:the|this)|now have access|will see (?:the|this|these|your))\b/i;
const THEY_VIEW_CLAIM = /\bthey can (?:now )?view\b/i;
const WELCOME_NAME_CLAIM = /\bwelcome,?\s+([A-Za-z][A-Za-z'.-]{0,40})\b/i;
const WELCOME_NOT_A_NAME = new Set(['aboard', 'back', 'home', 'to', 'everyone', 'all', 'there']);
const JOINING_TRIP_CLAIM = /\b([A-Za-z][A-Za-z'.-]{0,40})\s+(?:is\s+)?joining(?:\s+the)?\s+trip\b/i;
const JOINED_TRIP_CLAIM = /\b([A-Za-z][A-Za-z'.-]{0,40})\s+has\s+joined(?:\s+the)?\s+trip\b/i;
const JOINED_TRIP_SHORT_CLAIM = /\b([A-Za-z][A-Za-z'.-]{0,40})\s+joined(?:\s+the)?\s+trip\b/i;
const ON_TRIP_CLAIM = /\b([A-Za-z][A-Za-z'.-]{0,40})\s+is(?:\s+now)?\s+on\s+the\s+trip\b/i;

export const REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP = 'reply_action_claim_collaborator_not_on_trip';
export const REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY = 'reply_action_claim_unscheduled_place_day';

const WEEKDAY_NAME = /\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i;
const PLACE_DAY_SCHEDULE_CLAIM = /\b(?:added|put|placed|scheduled|slotted|booked)\b[^.!?]{0,140}\b(?:on|to|for)\b[^.!?]{0,60}(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i;

class ReplyActionClaimBlockedError extends Error {
  constructor(reason, tripId) {
    super('reply_action_claim_blocked');
    this.name = 'reply_action_claim_blocked';
    this.reason = reason;
    this.tripId = tripId;
  }
}

function collaboratorInviteSucceeded(turnActionResults) {
  return turnActionResults?.invite?.ok === true;
}

function replyClaimsCollaboratorInviteAction(reply) {
  const body = String(reply || '');
  if (!body.trim()) return false;
  if (INVITE_SUCCESS_CLAIM.test(body) && /\bcollaborator\b/i.test(body)) return true;
  if (ADDED_COLLABORATOR_CLAIM.test(body)) return true;
  if (INVITE_SENT_CLAIM.test(body) && /\bcollaborator\b/i.test(body)) return true;
  if (SHARED_WITH_CLAIM.test(body)) return true;
  if (INVITE_SUCCESS_CLAIM.test(body) && /\b(?:wife|husband|spouse|partner)\b/i.test(body)) return true;
  if (VIEW_ACCESS_CLAIM.test(body)) return true;
  if (THEY_VIEW_CLAIM.test(body)) return true;
  if (/\bwill see\b/i.test(body) && /\b(?:trip|plan|itinerary|site|these)\b/i.test(body)) return true;
  return false;
}

function nameTokens(value) {
  return String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function collaboratorIsActive(name, activeCollaborators) {
  const claimed = nameTokens(name);
  if (!claimed.length) return false;
  const first = claimed[0];
  for (const active of Array.isArray(activeCollaborators) ? activeCollaborators : []) {
    const tokens = nameTokens(active);
    if (!tokens.length) continue;
    if (tokens.join(' ') === claimed.join(' ')) return true;
    if (tokens[0] === first) return true;
  }
  return false;
}

function claimedCollaboratorNameFromMatch(pattern, match) {
  const raw = String(match?.[1] || '').trim();
  if (!raw) return '';
  if (pattern === WELCOME_NAME_CLAIM && WELCOME_NOT_A_NAME.has(raw.toLowerCase())) return '';
  return raw;
}

function claimedCollaboratorNames(reply) {
  const body = String(reply || '');
  const names = [];
  for (const pattern of [
    WELCOME_NAME_CLAIM,
    JOINING_TRIP_CLAIM,
    JOINED_TRIP_CLAIM,
    JOINED_TRIP_SHORT_CLAIM,
    ON_TRIP_CLAIM,
  ]) {
    const match = body.match(pattern);
    const name = claimedCollaboratorNameFromMatch(pattern, match);
    if (name) names.push(name);
  }
  return names;
}

function replyClaimsCollaboratorOnTrip(reply) {
  return claimedCollaboratorNames(reply).length > 0;
}

export function replyClaimContextFromIntent(intent) {
  if (!intent || typeof intent !== 'object') return null;
  const activeCollaborators = Array.isArray(intent.activeCollaborators)
    ? intent.activeCollaborators.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  return { activeCollaborators };
}

function collaboratorOnTripClaimReason(reply, claimContext = null) {
  if (!replyClaimsCollaboratorOnTrip(reply)) return '';
  const activeCollaborators = Array.isArray(claimContext?.activeCollaborators)
    ? claimContext.activeCollaborators
    : [];
  for (const name of claimedCollaboratorNames(reply)) {
    if (!collaboratorIsActive(name, activeCollaborators)) {
      return REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP;
    }
  }
  return '';
}

function replyMentionsPlaceTitle(reply, title) {
  const body = String(reply || '').toLowerCase();
  const tokens = String(title || '').trim().toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  if (!tokens.length) return false;
  return tokens.every((token) => body.includes(token));
}

function unscheduledPlaceDayClaimReason(reply, claimContext = null) {
  const titles = Array.isArray(claimContext?.unscheduledChatPlaceTitles)
    ? claimContext.unscheduledChatPlaceTitles.map((title) => String(title || '').trim()).filter(Boolean)
    : [];
  if (!titles.length) return '';
  const body = String(reply || '');
  if (!body.trim() || !WEEKDAY_NAME.test(body)) return '';
  if (!PLACE_DAY_SCHEDULE_CLAIM.test(body)) return '';
  for (const title of titles) {
    if (replyMentionsPlaceTitle(body, title)) return REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY;
  }
  return '';
}

export function replyActionClaimReason(reply, turnActionResults = null, claimContext = null) {
  if (replyClaimsCollaboratorInviteAction(reply)) {
    if (!collaboratorInviteSucceeded(turnActionResults)) return 'reply_action_claim_unbacked';
    return '';
  }
  const unscheduledDay = unscheduledPlaceDayClaimReason(reply, claimContext);
  if (unscheduledDay) return unscheduledDay;
  return collaboratorOnTripClaimReason(reply, claimContext);
}

export function activeCollaboratorsFromParty(party) {
  const stored = party && typeof party === 'object' ? party : {};
  return (Array.isArray(stored.collaborators) ? stored.collaborators : [])
    .map((person) => String(person?.name || '').trim())
    .filter(Boolean);
}

export function failReplyActionClaim(reason, tripId = '') {
  const id = String(tripId || '').trim();
  console.error(JSON.stringify({ reason, tripId: id }));
  throw new ReplyActionClaimBlockedError(reason, id);
}

export async function blockVacationAppReplyActionClaim({
  replyText,
  tripId,
  turnActionResults,
  replyClaimContext = null,
  db,
  turnId,
  payload,
  customerLive,
  base,
  storeReplyFailure,
}) {
  const reason = replyActionClaimReason(replyText, turnActionResults, replyClaimContext);
  if (!reason) return null;
  try {
    failReplyActionClaim(reason, tripId);
  } catch (error) {
    if (error?.name !== 'reply_action_claim_blocked') throw error;
    const replyFailure = 'reply_action_claim_blocked';
    payload.replyFailure = replyFailure;
    customerLive.replyFailure = replyFailure;
    payload.blockedReasons = [String(error.reason || reason)];
    customerLive.blockedReasons = payload.blockedReasons;
    await storeReplyFailure(db, turnId, payload);
    return { ...base, ok: false, status: 'reply_unavailable', error: replyFailure };
  }
  return null;
}
