import { customerInputState } from './intake-shared-trip.mjs';
import { intakeLodgingWanted } from './trip-intake-classify.mjs';

/** Structured lodging gap from saved trip rows and intake wantedThings (category/kind only). */
export function firstIntakeLodgingCustomerInput(savedThings = [], wantedThings = []) {
  const records = [
    ...(Array.isArray(savedThings) ? savedThings : []),
    ...intakeLodgingWanted([], wantedThings),
  ];
  return customerInputState(records);
}

export const FIRST_INTAKE_GAP_ORDER = ['where', 'when', 'who', 'lodging', 'plans', 'invite_contact'];

function finalizeFirstIntakeGaps(facts = {}) {
  if (!facts || typeof facts !== 'object') return facts;
  const present = new Set(Array.isArray(facts.gaps) ? facts.gaps : []);
  if (facts.lodgingAsk === true) present.add('lodging');
  if (facts.invite_contact_needed === true) present.add('invite_contact');
  if (present.size) facts.gaps = FIRST_INTAKE_GAP_ORDER.filter((key) => present.has(key));
  return facts;
}

export function applyCustomerInputToFirstIntakeFacts(facts, inputState = {}) {
  if (!facts || typeof facts !== 'object') return facts;
  if (inputState?.lodgingAsk === true) {
    facts.lodgingAsk = true;
    if (Array.isArray(inputState.needsCustomerInput) && inputState.needsCustomerInput.length) {
      facts.needsCustomerInput = inputState.needsCustomerInput.map((item) => String(item || '').trim()).filter(Boolean);
    }
  }
  return finalizeFirstIntakeGaps(facts);
}

export function attachFirstIntakeCustomerInputPayload(payload, inputState = {}) {
  if (!payload || typeof payload !== 'object') return;
  const gap = inputState && typeof inputState === 'object' ? inputState : {};
  if (gap.lodgingAsk !== true) return;
  const customerInputStatePayload = {
    needsCustomerInput: Array.isArray(gap.needsCustomerInput) ? gap.needsCustomerInput : ['lodging'],
    lodgingAsk: true,
  };
  payload.customerInputState = customerInputStatePayload;
  const prior = payload.tripContext && typeof payload.tripContext === 'object' ? payload.tripContext : {};
  payload.tripContext = { ...prior, ...customerInputStatePayload };
}

export async function persistTripLodgingCustomerInputGap(env, tripId, inputState = {}) {
  const id = String(tripId || '').trim();
  if (!id || !env?.DATABASE_URL) return;
  const gap = inputState && typeof inputState === 'object' ? inputState : {};
  const { sql } = await import('./db.mjs');
  const db = sql(env);
  if (gap.lodgingAsk === true) {
    await db`
      update trips
      set metadata = coalesce(metadata, '{}'::jsonb) || ${{
        needsCustomerInput: Array.isArray(gap.needsCustomerInput) ? gap.needsCustomerInput : ['lodging'],
        lodgingAsk: true,
        lastAskedGap: 'lodging',
      }},
        updated_at = now()
      where id = ${id}
    `;
    return;
  }
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) - 'needsCustomerInput' - 'lodgingAsk' - 'lastAskedGap',
        updated_at = now()
    where id = ${id}
  `;
}

export async function persistTripInviteContactNeeded(env, tripId, needed = false) {
  const id = String(tripId || '').trim();
  if (!id || !env?.DATABASE_URL) return;
  const { sql } = await import('./db.mjs');
  const db = sql(env);
  if (needed === true) {
    await db`
      update trips
      set metadata = coalesce(metadata, '{}'::jsonb) || ${{ invite_contact_needed: true }},
          updated_at = now()
      where id = ${id}
    `;
    return;
  }
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) - 'invite_contact_needed',
        updated_at = now()
    where id = ${id}
  `;
}

export async function persistTripGapAskState(env, tripId, state = {}) {
  const id = String(tripId || '').trim();
  if (!id || !env?.DATABASE_URL || !state || typeof state !== 'object') return;
  const patch = {};
  const lastAskedGap = String(state.lastAskedGap || '').trim();
  if (lastAskedGap) patch.lastAskedGap = lastAskedGap;
  if (state.lodgingAsk === true) {
    patch.lodgingAsk = true;
    patch.needsCustomerInput = Array.isArray(state.needsCustomerInput) ? state.needsCustomerInput : ['lodging'];
  } else if (state.lodgingAsk === false) {
    patch.lodgingAsk = false;
  }
  if (state.invite_contact_needed === true) patch.invite_contact_needed = true;
  if (Array.isArray(state.needsCustomerInput) && state.needsCustomerInput.length) {
    patch.needsCustomerInput = state.needsCustomerInput;
  }
  const flightAsk = String(state.flightAsk || '').trim();
  if (flightAsk) patch.flightAsk = flightAsk;
  if (!Object.keys(patch).length) return;
  const { sql } = await import('./db.mjs');
  const db = sql(env);
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${patch},
        updated_at = now()
    where id = ${id}
  `;
}

export function syncFirstIntakeCustomerInputOnTurn(payload, customerLive, { firstIntake = false, produced = null } = {}) {
  if (!firstIntake || !produced?.customerInput) return;
  attachFirstIntakeCustomerInputPayload(payload, produced.customerInput);
  if (payload.tripContext && typeof payload.tripContext === 'object') {
    customerLive.tripContext = payload.tripContext;
  }
  if (payload.customerInputState && typeof payload.customerInputState === 'object') {
    customerLive.customerInputState = payload.customerInputState;
  }
}
