import { parseTimeToHHMM } from './chat-itinerary-edit-day.mjs';
import { digestTripState, tripItemKinds } from './trip-state-action-site.mjs';
import { isTripThingName, normalizeTripThingName, tripThingNameInText } from './trip-thing-name-shape.mjs';

const argumentsByAction = {
  add_named_item: ['type', 'label', 'evidence', 'details', 'day', 'role', 'time', 'time_evidence'],
  add_from_search: ['candidate', 'day', 'role', 'replace_hotel', 'time', 'time_evidence'],
  place_on_day: ['item', 'day', 'role', 'time', 'time_evidence', 'before', 'move', 'occurrence'],
  set_time: ['item', 'day', 'role', 'time', 'time_evidence', 'move'],
  set_stay: ['hotel', 'check_in', 'check_out', 'check_in_time', 'check_out_time', 'check_in_evidence', 'check_out_evidence'],
  hold_invite: ['name', 'access'],
  save_plan: ['operations', 'authority'],
};

export const validTripStateId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value);
export const actionFailure = (result, detail) => ({ result, detail, refs: [] });
export const proactivePlanBlocks = {
  'Settle in and get oriented': 'activity',
  'Free time to explore nearby': 'activity',
  'Pack and get ready to leave': 'activity',
};
export function validateActionArguments(op, args) {
  return args != null && typeof args === 'object' && !Array.isArray(args)
    && Object.hasOwn(argumentsByAction, op) && Object.keys(args).every((key) => argumentsByAction[op].includes(key));
}

export function authorizedActionIndex(authority, op, args, state, { after = -1, as } = {}) {
  if (authority?.source !== 'customer' && authority?.source !== 'proposal') return -1;
  if (authority.source === 'proposal' && (!validTripStateId(authority.id)
    || !['offered', 'accepted'].includes(state.proposals?.[authority.id]?.status))) return -1;
  if (!Array.isArray(authority.commands)) return -1;
  const signature = digestTripState([op, args, as]);
  return authority.commands.findIndex((command, index) => index > after
    && digestTripState([command?.op, command?.args, command?.as]) === signature);
}

export function systemPlanAllows(authority, op, saved) {
  return authority?.source === 'system_plan' && validTripStateId(authority.id)
    && (['save_plan', 'place_on_day', 'add_from_search'].includes(op)
      || (authority.planKey === authority.researchKey && validTripStateId(authority.planKey)
        && ['add_named_item', 'set_stay'].includes(op)))
    && Boolean(saved.trip.destination && saved.trip.start && saved.trip.end && Object.keys(saved.days).length);
}

function customerSpan(context, ref) {
  if (!validTripStateId(ref) || !Object.hasOwn(context.authority?.spans || {}, ref)) return null;
  const span = context.authority.spans[ref];
  const { start, end, turn } = span || {};
  const text = turn == null || turn === context.turn ? context.customerText
    : Number.isInteger(turn) && turn < context.turn
      ? context.priorTurns?.find((row) => row.turn === turn && row.role === 'customer')?.text : null;
  if (typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end <= start || end > text.length) return null;
  return { ...span, text: text.slice(start, end).trim() };
}

function sameName(label, evidence) {
  return isTripThingName(evidence) && normalizeTripThingName(label) === normalizeTripThingName(evidence);
}

export function hasExplicitAccessGrant(context, name, access) {
  if (context.authority?.source !== 'customer' || !isTripThingName(name)) return false;
  return Object.keys(context.authority.spans || {}).some((ref) => {
    const span = customerSpan(context, ref);
    return span?.kind === 'access_grant' && (span.turn == null || span.turn === context.turn)
      && span.access === access && sameName(name, span.name) && tripThingNameInText(name, span.text);
  });
}

export function itemEvidence(context, args) {
  const { label, type } = args;
  if (!tripItemKinds.has(type) || !isTripThingName(label)) return null;
  const span = customerSpan(context, args.evidence);
  if (!span || !['place', 'plan_block'].includes(span.kind) || !sameName(label, span.text)) return null;
  if (type === 'hotel' && span.kind !== 'place') return null;
  if (context.authority.source === 'proposal'
    && !context.state.proposals[context.authority.id].lines.some((line) => line.type === type && sameName(label, line.label))) return null;
  if (type === 'flight_option') return 'comparison';
  if (span.basis === 'placeholder') return 'placeholder';
  return span.kind === 'plan_block' ? 'plan_block' : 'named';
}

export function validatedTime(context, value, evidence, allowProposed = false) {
  if (value == null) return value;
  if (typeof value !== 'object' || Object.keys(value).some((key) => key !== 'value' && key !== 'precision')
    || typeof value.value !== 'string' || value.value.length > 40) return undefined;
  if (value.precision === 'proposed') {
    return allowProposed && evidence == null && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.value) ? value : undefined;
  }
  if (context.authority?.source === 'system_plan' && !context.authority.planKey) return undefined;
  const span = customerSpan(context, evidence);
  if (span?.kind !== 'time' || !span.text || (span.precision && span.precision !== value.precision)) return undefined;
  if (value.precision === 'window') {
    return isTripThingName(value.value) && !/\p{N}/u.test(span.text) && sameName(value.value, span.text) ? value : undefined;
  }
  const clock = /^(?:([01]?\d|2[0-3]):[0-5]\d|(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*[ap]\.?m\.?)$/i;
  return value.precision === (span.precision || 'exact')
    && ['exact', 'approximate'].includes(value.precision)
    && clock.test(span.text) && parseTimeToHHMM(span.text) === value.value ? value : undefined;
}

export function typedItemDetails(type, details, context) {
  if (details == null && !['flight_option', 'ground_ride'].includes(type)) return {};
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const stamp = { via: 'chat_action', turn: context.turn };
  const grounded = (value) => typeof value === 'string' && value.length <= 280
    && tripThingNameInText(value, context.customerText);
  if (type === 'flight_option' && Object.keys(details).every((key) => ['direction', 'carrier', 'origin', 'destination'].includes(key))) {
    const { direction, carrier = null, origin = null, destination = null } = details;
    if (['outbound', 'return', 'other'].includes(direction) && [carrier, origin, destination].every((value) => value === null || grounded(value))) {
      return { flight: { direction, carrier, origin, destination, evidence: 'customer_option', ...stamp } };
    }
  }
  if (type === 'ground_ride' && Object.keys(details).every((key) => ['mode', 'between'].includes(key))) {
    const { mode, between } = details;
    if (['ride', 'rental', 'transit', 'other'].includes(mode) && Array.isArray(between) && between.length === 2 && between.every(grounded)) {
      return { ride: { mode, between, ...stamp } };
    }
  }
  return null;
}
