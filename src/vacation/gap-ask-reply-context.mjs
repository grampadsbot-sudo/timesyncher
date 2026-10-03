import { intakeLodgingWanted } from './trip-intake-classify.mjs';
import { statedLodgingLabelFromThings } from './intake-shared-trip.mjs';
import { FIRST_INTAKE_GAP_ORDER } from './first-intake-customer-input.mjs';

function lodgingSatisfied(things = [], trip = {}) {
  if (statedLodgingLabelFromThings(things)) return true;
  return Boolean(String(trip?.lodging || trip?.statedLodgingArea || trip?.statedLodgingAreaHint || '').trim());
}

export function gapSatisfied(gap, things = [], trip = {}) {
  const key = String(gap || '').trim();
  if (!key) return true;
  if (key === 'lodging') return lodgingSatisfied(things, trip);
  if (key === 'invite_contact') return trip?.inviteContactFilled === true;
  if (key === 'where') return Boolean(String(trip?.destination || '').trim());
  if (key === 'when') return Boolean(trip?.start || trip?.span?.start);
  if (key === 'who') {
    const party = trip?.party && typeof trip.party === 'object' ? trip.party : {};
    return Boolean(String(party?.primary?.name || '').trim());
  }
  if (key === 'plans') return (Array.isArray(things) ? things : []).length > 0;
  return true;
}

function nextOpenGapAfter(filledGap, things, trip) {
  const filled = String(filledGap || '').trim();
  const order = FIRST_INTAKE_GAP_ORDER;
  const start = filled ? order.indexOf(filled) + 1 : 0;
  const inviteNeeded = trip?.invite_contact_needed === true;
  for (let i = Math.max(0, start); i < order.length; i += 1) {
    const gap = order[i];
    if (gap === 'invite_contact' && !inviteNeeded) continue;
    if (!gapSatisfied(gap, things, trip)) return gap;
  }
  return '';
}

function lodgingFilledThisTurn(saved = {}, merged = {}, { wantedThings = [] } = {}) {
  if (intakeLodgingWanted([], wantedThings).length > 0) return true;
  if (String(merged?.gapFilledThisTurn || '').trim() === 'lodging') return true;
  return !lodgingSatisfied(saved?.things || [], saved) && lodgingSatisfied(merged?.things || [], merged);
}

export function detectGapAnswerTurn(saved = {}, merged = {}, options = {}) {
  const lastAsked = String(merged?.lastAskedGap || saved?.lastAskedGap || '').trim();
  if (!lastAsked) return { gapAnswerTurn: false };
  if (lastAsked === 'lodging' && lodgingFilledThisTurn(saved, merged, options)) {
    return { gapAnswerTurn: true, gapFilledThisTurn: 'lodging' };
  }
  const explicit = String(merged?.gapFilledThisTurn || '').trim();
  if (explicit && explicit === lastAsked) return { gapAnswerTurn: true, gapFilledThisTurn: explicit };
  return { gapAnswerTurn: false };
}

export function annotateLiveTurnGapAnswer(merged = {}, saved = null, { wantedThings = [] } = {}) {
  const base = merged && typeof merged === 'object' ? merged : {};
  const prior = saved && typeof saved === 'object' ? saved : {};
  const withMeta = {
    ...base,
    lastAskedGap: String(base.lastAskedGap || prior.lastAskedGap || '').trim(),
    invite_contact_needed: base.invite_contact_needed === true || prior.invite_contact_needed === true,
    statedLodgingArea: String(base.statedLodgingArea || prior.statedLodgingArea || '').trim(),
    destination: String(base.destination || prior.destination || '').trim(),
  };
  const detected = detectGapAnswerTurn(prior, withMeta, { wantedThings });
  if (!detected.gapAnswerTurn) return withMeta;
  return { ...withMeta, gapAnswerTurn: true, gapFilledThisTurn: detected.gapFilledThisTurn };
}

function askFieldsForGap(gap, things, trip) {
  const key = String(gap || '').trim();
  if (!key) return {};
  if (key === 'lodging') {
    return { lodgingAsk: true, needsCustomerInput: ['lodging'], persistGapAsk: { lastAskedGap: 'lodging', lodgingAsk: true, needsCustomerInput: ['lodging'] } };
  }
  if (key === 'invite_contact') {
    return {
      invite_contact_needed: true,
      inviteContactAsk: true,
      gaps: [key],
      needsCustomerInput: ['invite_contact'],
      persistGapAsk: { lastAskedGap: 'invite_contact', invite_contact_needed: true, lodgingAsk: false, needsCustomerInput: ['invite_contact'] },
    };
  }
  if (key === 'flight' || key === 'car') {
    const flightAsk = key === 'flight' ? 'missing' : '';
    if (flightAsk) {
      return { flightAsk, needsCustomerInput: [key], persistGapAsk: { lastAskedGap: key, flightAsk, needsCustomerInput: [key] } };
    }
    return { needsCustomerInput: [key], persistGapAsk: { lastAskedGap: key, needsCustomerInput: [key] } };
  }
  return { gaps: [key], persistGapAsk: { lastAskedGap: key } };
}

export function replyGapAskFields(record = {}, things = []) {
  if (!record || typeof record !== 'object') return {};
  if (record.gapAnswerTurn !== true) return {};
  const filled = String(record.gapFilledThisTurn || record.lastAskedGap || '').trim();
  if (!filled) return {};
  const next = nextOpenGapAfter(filled, things, record);
  if (!next) return {};
  const { persistGapAsk, ...publicFields } = askFieldsForGap(next, things, record);
  return persistGapAsk ? { ...publicFields, _persistGapAsk: persistGapAsk } : publicFields;
}

export function stripGapAskPersistHints(facts = {}) {
  if (!facts || typeof facts !== 'object') return facts;
  const { _persistGapAsk, ...rest } = facts;
  return rest;
}
