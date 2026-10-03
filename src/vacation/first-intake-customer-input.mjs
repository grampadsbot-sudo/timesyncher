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

export function applyCustomerInputToFirstIntakeFacts(facts, inputState = {}) {
  if (!facts || typeof facts !== 'object') return facts;
  if (inputState?.lodgingAsk !== true) return facts;
  facts.lodgingAsk = true;
  if (Array.isArray(inputState.needsCustomerInput) && inputState.needsCustomerInput.length) {
    facts.needsCustomerInput = inputState.needsCustomerInput.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return facts;
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
      }},
        updated_at = now()
      where id = ${id}
    `;
    return;
  }
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) - 'needsCustomerInput' - 'lodgingAsk',
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
