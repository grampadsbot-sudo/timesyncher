const INVITE_SUCCESS_CLAIM = /\b(?:i(?:'|')ve|i have|we(?:'|')ve|we have)\s+(?:added|invited)\b/i;
const INVITE_SENT_CLAIM = /\bsent\s+(?:the\s+)?invite\b/i;
const SHARED_WITH_CLAIM = /\bshared\s+(?:this\s+)?(?:trip|itinerary|plan|site)\s+with\b/i;
const ADDED_COLLABORATOR_CLAIM = /\badded\s+.{1,120}\s+as\s+(?:a\s+)?collaborator\b/i;
const VIEW_ACCESS_CLAIM = /\b(?:can now view|can view (?:the|this)|now have access|will see (?:the|this|these|your))\b/i;
const THEY_VIEW_CLAIM = /\bthey can (?:now )?view\b/i;
const WELCOME_NAME_CLAIM = /\bwelcome,?\s+([A-Za-z][A-Za-z'.-]{0,40})\b/i;
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

export function partyNamesFromDialogParty(party) {
  const names = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (text) names.push(text);
  };
  if (!party || typeof party !== 'object') return names;
  if (party.primary?.name) add(party.primary.name);
  for (const key of ['collaborators', 'preference_subjects', 'viewers', 'editors']) {
    for (const person of Array.isArray(party[key]) ? party[key] : []) add(person?.name);
  }
  return names;
}

function pendingInviteeNamesFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.name || row?.label || '').trim())
    .filter(Boolean);
}

function replyClaimPartyMemberNames(claimContext = null) {
  const ctx = claimContext && typeof claimContext === 'object' ? claimContext : {};
  const names = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (text) names.push(text);
  };
  for (const active of Array.isArray(ctx.activeCollaborators) ? ctx.activeCollaborators : []) add(active);
  for (const name of Array.isArray(ctx.rosterMemberNames) ? ctx.rosterMemberNames : []) add(name);
  for (const name of pendingInviteeNamesFromRows(ctx.pendingInvitees)) add(name);
  for (const name of Array.isArray(ctx.pendingInviteeNames) ? ctx.pendingInviteeNames : []) add(name);
  for (const name of Array.isArray(ctx.turnInviteeNames) ? ctx.turnInviteeNames : []) add(name);
  for (const name of partyNamesFromDialogParty(ctx.dialogParty)) add(name);
  return [...new Set(names)];
}

function claimedCollaboratorNames(reply, claimContext = null) {
  const partyMembers = replyClaimPartyMemberNames(claimContext);
  if (!partyMembers.length) return [];
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
    const raw = String(match?.[1] || '').trim();
    if (!raw || !collaboratorIsActive(raw, partyMembers)) continue;
    names.push(raw);
  }
  return names;
}

function replyClaimsCollaboratorOnTrip(reply, claimContext = null) {
  return claimedCollaboratorNames(reply, claimContext).length > 0;
}

export function replyClaimContextFromIntent(intent) {
  if (!intent || typeof intent !== 'object') return null;
  const activeCollaborators = Array.isArray(intent.activeCollaborators)
    ? intent.activeCollaborators.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const rosterMemberNames = (Array.isArray(intent.roster) ? intent.roster : [])
    .map((person) => String(person?.name || '').trim())
    .filter(Boolean);
  const pendingInvitees = Array.isArray(intent.pendingInvitees)
    ? intent.pendingInvitees
    : (Array.isArray(intent.tripContext?.pendingInvitees) ? intent.tripContext.pendingInvitees : []);
  const pendingInviteeNames = pendingInviteeNamesFromRows(pendingInvitees);
  const turnInviteeNames = [];
  const inviteName = String(
    intent.turnActionResults?.invite?.inviteeName
    || intent.classification?.inviteeName
    || '',
  ).trim();
  if (inviteName) turnInviteeNames.push(inviteName);
  const unscheduledChatPlaceTitles = Array.isArray(intent.unscheduledChatPlaceTitles)
    ? intent.unscheduledChatPlaceTitles.map((title) => String(title || '').trim()).filter(Boolean)
    : [];
  return {
    activeCollaborators,
    rosterMemberNames,
    pendingInviteeNames,
    turnInviteeNames,
    ...(pendingInvitees.length ? { pendingInvitees } : {}),
    ...(unscheduledChatPlaceTitles.length ? { unscheduledChatPlaceTitles } : {}),
  };
}

function collaboratorOnTripClaimReason(reply, claimContext = null) {
  if (!replyClaimsCollaboratorOnTrip(reply, claimContext)) return '';
  const activeCollaborators = Array.isArray(claimContext?.activeCollaborators)
    ? claimContext.activeCollaborators
    : [];
  for (const name of claimedCollaboratorNames(reply, claimContext)) {
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
