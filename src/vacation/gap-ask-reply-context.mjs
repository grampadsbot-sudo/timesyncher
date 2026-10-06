import { intakeLodgingWanted } from './trip-intake-classify.mjs';
import { statedLodgingLabelFromThings } from './intake-shared-trip.mjs';
import { FIRST_INTAKE_GAP_ORDER, persistTripGapAskState } from './first-intake-customer-input.mjs';

function lodgingSatisfied(things = [], trip = {}) {
  if (statedLodgingLabelFromThings(things)) return true;
  return Boolean(String(trip?.lodging || trip?.statedLodgingArea || trip?.statedLodgingAreaHint || '').trim());
}

function gapSatisfied(gap, things = [], trip = {}) {
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
  return true;
}

function nextOpenGapAfter(filledGap, things, trip) {
  const filled = String(filledGap || '').trim();
  const order = FIRST_INTAKE_GAP_ORDER;
  const start = filled ? order.indexOf(filled) + 1 : 0;
  const inviteNeeded = trip?.invite_contact_needed === true;
  for (let i = Math.max(0, start); i < order.length; i += 1) {
    const gap = order[i];
    if (gap === 'plans') continue;
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

function detectGapAnswerTurn(saved = {}, merged = {}, options = {}) {
  const lastAsked = String(merged?.lastAskedGap || saved?.lastAskedGap || '').trim();
  if (!lastAsked) return { gapAnswerTurn: false };
  if (lastAsked === 'lodging' && lodgingFilledThisTurn(saved, merged, options)) {
    return { gapAnswerTurn: true, gapFilledThisTurn: 'lodging' };
  }
  const explicit = String(merged?.gapFilledThisTurn || '').trim();
  if (explicit && explicit === lastAsked) return { gapAnswerTurn: true, gapFilledThisTurn: explicit };
  return { gapAnswerTurn: false };
}

export function savedTripGapFields(meta = {}) {
  const row = meta && typeof meta === 'object' ? meta : {};
  return {
    statedLodgingArea: String(row.statedLodgingArea || row.statedLodgingAreaHint || '').trim(),
    lastAskedGap: String(row.lastAskedGap || '').trim(),
    invite_contact_needed: row.invite_contact_needed === true,
    lodgingAsk: row.lodgingAsk === true,
    needsCustomerInput: Array.isArray(row.needsCustomerInput) ? row.needsCustomerInput : undefined,
    flightAsk: String(row.flightAsk || '').trim(),
  };
}

export function mergeSavedTripGapFields(saved = {}) {
  const row = saved && typeof saved === 'object' ? saved : {};
  return {
    lastAskedGap: String(row.lastAskedGap || '').trim(),
    invite_contact_needed: row.invite_contact_needed === true,
    statedLodgingArea: String(row.statedLodgingArea || '').trim(),
  };
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

function askSignalsForGap(gap, things, trip) {
  const key = String(gap || '').trim();
  if (!key || key === 'plans') return { fields: {}, persistGapAsk: null };
  if (key === 'lodging') {
    return {
      fields: { lodgingAsk: true, needsCustomerInput: ['lodging'] },
      persistGapAsk: { lastAskedGap: 'lodging', lodgingAsk: true, needsCustomerInput: ['lodging'] },
    };
  }
  if (key === 'invite_contact') {
    return {
      fields: {
        invite_contact_needed: true,
        inviteContactAsk: true,
        gaps: [key],
        needsCustomerInput: ['invite_contact'],
      },
      persistGapAsk: {
        lastAskedGap: 'invite_contact',
        invite_contact_needed: true,
        lodgingAsk: false,
        needsCustomerInput: ['invite_contact'],
      },
    };
  }
  if (key === 'flight') {
    return {
      fields: { flightAsk: 'missing', needsCustomerInput: [key] },
      persistGapAsk: { lastAskedGap: key, flightAsk: 'missing', needsCustomerInput: [key] },
    };
  }
  if (key === 'car') {
    return {
      fields: { needsCustomerInput: [key] },
      persistGapAsk: { lastAskedGap: key, needsCustomerInput: [key] },
    };
  }
  return { fields: { gaps: [key] }, persistGapAsk: { lastAskedGap: key } };
}

function replyGapAskSignals(record = {}, things = []) {
  if (!record || typeof record !== 'object' || record.gapAnswerTurn !== true) {
    return { fields: {}, persistGapAsk: null };
  }
  const filled = String(record.gapFilledThisTurn || record.lastAskedGap || '').trim();
  if (!filled) return { fields: {}, persistGapAsk: null };
  const next = nextOpenGapAfter(filled, things, record);
  if (!next) return { fields: {}, persistGapAsk: null };
  return askSignalsForGap(next, things, record);
}

export function draftingGapFields(record = {}, things = []) {
  const { fields, persistGapAsk } = replyGapAskSignals(record, things);
  return { facts: { ...fields }, persistGapAsk };
}

export function gapAskReplyPromptTripRaw(tripSource, postIntake, visibleTripContext) {
  const gapAskPromptTurn = postIntake === true || tripSource?.gapAnswerTurn === true;
  let tripRaw = visibleTripContext(tripSource);
  if (!gapAskPromptTurn && tripRaw && typeof tripRaw === 'object') {
    tripRaw = { ...tripRaw };
    delete tripRaw.lodgingAsk;
    delete tripRaw.flightAsk;
    delete tripRaw.inviteContactAsk;
  }
  return { tripRaw, gapAskPromptTurn };
}

export function perFactGapAskRuleLines(tripRaw = {}) {
  const lodgingAsk = tripRaw?.lodgingAsk === true;
  const flightAsk = String(tripRaw?.flightAsk || '').trim();
  const inviteContactAsk = tripRaw?.inviteContactAsk === true;
  return [
    lodgingAsk ? 'The saved trip record includes lodgingAsk. Ask the customer where they are staying, in your own words.' : '',
    flightAsk ? 'The saved trip record includes flightAsk. Ask the customer about their flights, in your own words.' : '',
    inviteContactAsk ? 'The saved trip record includes inviteContactAsk. Ask for the collaborator name and email so you can invite them, in your own words.' : '',
  ].filter(Boolean);
}

export async function draftingFactsForLiveReply(draftingFactsFn, history, customerTurn, mergedTrip, env, tripId) {
  const things = Array.isArray(mergedTrip?.things) ? mergedTrip.things : [];
  const { persistGapAsk } = replyGapAskSignals(mergedTrip, things);
  const id = String(tripId || '').trim();
  if (persistGapAsk && id) await persistTripGapAskState(env, id, persistGapAsk);
  return draftingFactsFn(history, customerTurn, mergedTrip);
}
