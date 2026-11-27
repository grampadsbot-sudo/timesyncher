import { tripThingNameInText } from './trip-thing-name-shape.mjs';
import { intakeLodgingWanted } from './trip-intake-classify.mjs';
import {
  persistIntakeLodgingThings,
  persistIntakeLodgingLookupOnCustomerTurn,
} from './intake-lodging-thing.mjs';
import { searchIntakeLodgingPlaces } from './intake-lodging-search.mjs';
import { tripRowForStateActions, tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';
import { validatePlannedThings } from './chat-planned-thing-validation.mjs';

export async function maybePersistFirstIntakeLodging({
  db, tripId, firstIntake, classificationOk, seat, wantedThings, customerText, customerTurnId, extractedDestination = '', env = process.env,
} = {}) {
  if (!firstIntake || classificationOk !== true || !tripId || seat) return null;
  return persistQueuedIntakeLodgingFromWanted(db, tripId, wantedThings, { extractedDestination, customerText, customerTurnId, env });
}

export async function persistQueuedIntakeLodgingFromWanted(db, tripId, wantedThings, {
  extractedDestination = '',
  customerText = '',
  customerTurnId = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchIntakeLodgingPlaces,
  trip = null,
} = {}) {
  const lodgingWanted = intakeLodgingWanted([], wantedThings).filter((thing) => tripThingNameInText(thing.title, customerText));
  if (!lodgingWanted.length || !db || !tripId) return null;
  const tripRow = await tripRowForStateActions(db, tripId, trip);
  const existingRows = await db`
    select id, category, title, description, metadata, location
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  const uniqueLodging = validatePlannedThings(lodgingWanted, { customerOnly: tripStateActionsEnabled({ env, trip: tripRow }), existing: existingRows });
  if (!uniqueLodging.length) return null;
  const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, uniqueLodging, {
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
