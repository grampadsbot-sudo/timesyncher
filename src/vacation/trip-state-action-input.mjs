import { parseTimeToHHMM } from './chat-itinerary-edit-day.mjs';
import { digestTripState, tripItemKinds } from './trip-state-action-site.mjs';

const argumentsByAction = {
  add_named_item: ['type', 'label', 'evidence', 'details'],
  add_from_search: ['candidate', 'day', 'role', 'replace_hotel'],
  place_on_day: ['item', 'day', 'role', 'time', 'time_evidence', 'before', 'move', 'occurrence'],
  set_time: ['item', 'day', 'role', 'time', 'time_evidence', 'move'],
  set_stay: ['hotel', 'check_in', 'check_out', 'check_in_time', 'check_out_time', 'check_in_evidence', 'check_out_evidence'],
  hold_invite: ['name', 'access'],
  save_plan: ['operations', 'authority'],
};

export const validTripStateId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value);
export const actionFailure = (result, detail) => ({ result, detail, refs: [] });
export const tripStateName = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replaceAll('ß', 'ss')
  .replace(/[’']/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, '');

export function validateActionArguments(op, args) {
  return args != null && typeof args === 'object' && !Array.isArray(args)
    && Object.hasOwn(argumentsByAction, op) && Object.keys(args).every((key) => argumentsByAction[op].includes(key));
}

export function actionAuthorized(authority, op, args, state) {
  if (authority?.source !== 'customer' && authority?.source !== 'proposal') return false;
  if (authority.source === 'proposal' && (!validTripStateId(authority.id)
    || !['offered', 'accepted'].includes(state.proposals?.[authority.id]?.status))) return false;
  const signature = digestTripState([op, args]);
  return authority.commands?.some((command) => digestTripState([command.op, command.args]) === signature) === true;
}

function customerSpan(context, ref) {
  if (!validTripStateId(ref) || !Object.hasOwn(context.authority?.spans || {}, ref)) return null;
  const span = context.authority.spans[ref];
  const { start, end, kind } = span || {};
  const text = context.customerText;
  if (typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end <= start || end > text.length) return null;
  return { kind, text: text.slice(start, end).trim() };
}

function nameInText(text, name) {
  return Boolean(name && ` ${tripStateName(text)} `.includes(` ${name} `));
}

export function nameWasDisclosed(context, label) {
  const name = tripStateName(label);
  if (!name || /^(?:each|one|both|them|him|her|everyone|someone|collaborator|guest)\b/u.test(name)
    || /^(?:my )?(?:husband|wife|partner|kids?|children|friend|sister|brother|parents?)$/u.test(name)) return false;
  return nameInText(context.customerText, name)
    || Object.values(context.state.disclosed || {}).some((fact) => fact.kind === 'party' && nameInText(fact.value, name));
}

export function itemEvidence(context, args) {
  const { label, type } = args;
  const name = tripStateName(label);
  if (!tripItemKinds.has(type) || typeof label !== 'string' || !name || label.length > 280 || name.split(' ').length > 12) return null;
  if (/^(?:nothing\b|no(?:thing)? (?:has|was|is)\b|and nothing\b|notes$|(?:add |put |save )?(?:them|it|that|these|those)\b|purple seventy bicycle$)/u.test(name)) return null;
  if (context.authority.source === 'proposal') {
    const lines = context.state.proposals[context.authority.id].lines;
    if (lines.some((line) => line.type === type && tripStateName(line.label) === name)
      && !(type === 'hotel' && /\b(?:settle in|pool time|swim|day shape)\b/u.test(name))) return 'plan_block';
    return null;
  }
  const span = customerSpan(context, args.evidence);
  if (!span || !['place', 'plan_block'].includes(span.kind) || !nameInText(span.text, name)) return null;
  if (type === 'hotel' && span.kind === 'plan_block') return null;
  if (type === 'hotel' && /\b(?:settle in|pool time|swim|day shape)\b/u.test(name)) return null;
  if (type === 'flight_option') return 'comparison';
  if (span.kind === 'plan_block') return 'plan_block';
  return type === 'hotel' && /\b(?:placeholder|tbd|hotel)$/.test(name) ? 'placeholder' : 'named';
}

export function validatedTime(context, value, evidence) {
  if (value == null) return value;
  if (typeof value !== 'object' || Object.keys(value).some((key) => key !== 'value' && key !== 'precision')
    || typeof value.value !== 'string' || value.value.length > 40) return undefined;
  const span = customerSpan(context, evidence);
  if (span?.kind !== 'time' || !span.text) return undefined;
  const { precision } = value;
  const clock = /^(?:([01]?\d|2[0-3]):[0-5]\d|(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*[ap]\.?m\.?)$/i;
  const rough = /^(?:about|around|approximately|roughly)\s+/i;
  const text = span.text.replace(rough, '').trim();
  if (precision === 'window') {
    return nameInText(span.text, tripStateName(value.value)) && !/\d/u.test(value.value)
      && /\b(?:morning|afternoon|evening|night|midday|noon|midnight|dawn|dusk)\b/i.test(value.value) ? value : undefined;
  }
  const expected = rough.test(span.text) ? 'approximate' : 'exact';
  return precision === expected && clock.test(text) && parseTimeToHHMM(text) === value.value ? value : undefined;
}

export function typedItemDetails(type, details, context) {
  if (details == null && !['flight_option', 'ground_ride'].includes(type)) return {};
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const stamp = { via: 'chat_action', turn: context.turn };
  const grounded = (value) => typeof value === 'string' && value.length <= 280
    && nameInText(context.customerText, tripStateName(value));
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
