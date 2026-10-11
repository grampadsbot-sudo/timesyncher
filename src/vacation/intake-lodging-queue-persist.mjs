import { intakeLodgingWanted } from './trip-intake-classify.mjs';
import {
  persistIntakeLodgingThings,
  persistIntakeLodgingLookupOnCustomerTurn,
} from './intake-lodging-thing.mjs';
import { searchIntakeLodgingPlaces } from './intake-lodging-search.mjs';

export async function maybePersistFirstIntakeLodging({
  db, tripId, firstIntake, classificationOk, seat, wantedThings, customerTurnId, extractedDestination = '', env = process.env,
} = {}) {
  if (!firstIntake || classificationOk !== true || !tripId || seat) return null;
  return persistQueuedIntakeLodgingFromWanted(db, tripId, wantedThings, { extractedDestination, customerTurnId, env });
}

/** First-intake queue: persist stated lodging before reply ship (reply gate may block). */
export async function persistQueuedIntakeLodgingFromWanted(db, tripId, wantedThings, {
  extractedDestination = '',
  customerTurnId = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchIntakeLodgingPlaces,
} = {}) {
  const lodgingWanted = intakeLodgingWanted([], wantedThings);
  if (!lodgingWanted.length || !db || !tripId) return null;
  const existingRows = await db`
    select id, category, title, description, metadata, location
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, lodgingWanted, {
    destinationHint: extractedDestination,
    areaHint: extractedDestination,
    env,
    fetchImpl,
    searchImpl,
    existingThings: existingRows,
  });
  if (customerTurnId && (lodgingOutcome?.lodgingOutcome || lodgingOutcome?.lookups?.length)) {
    await persistIntakeLodgingLookupOnCustomerTurn(
      db,
      customerTurnId,
      lodgingOutcome.lookups || [],
      lodgingOutcome.lodgingOutcome || null,
    );
  }
  return lodgingOutcome;
}
