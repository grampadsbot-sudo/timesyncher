import { assignTripSiteUrlWhenThingsPresent } from './trip-site-url-after-insert.mjs';
import { applyIntakeExtractedTripTitle } from './intake-title-persist.mjs';
import { intakeLodgingWanted } from './trip-intake-classify.mjs';
import {
  persistIntakeLodgingLookupOnCustomerTurn,
  persistIntakeLodgingThings,
} from './intake-lodging-thing.mjs';

export async function intakeItineraryExistingThings(
  db,
  tripId,
  text,
  extracted,
  wantedThings,
  {
    extractedDestination = '',
    extractedTitle = '',
    destinationError = null,
    titleError = null,
    searchImpl,
    searchPlacesImpl,
    env = process.env,
    fetchImpl = globalThis.fetch,
    customerTurnId = null,
    savedTripTitle = '',
  },
  loadTripThings,
) {
  const lodgingWanted = intakeLodgingWanted(extracted, wantedThings);
  if (String(text || '').trim()) {
    await applyIntakeExtractedTripTitle(db, tripId, {
      extractedDestination,
      extractedTitle,
      destinationError,
      titleError,
      savedTripTitle,
      searchImpl,
    });
  }
  if (lodgingWanted.length) {
    const current = await loadTripThings(db, tripId);
    const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, lodgingWanted, {
      destinationHint: extractedDestination,
      areaHint: extractedDestination,
      env,
      fetchImpl,
      searchImpl: searchPlacesImpl,
      existingThings: current,
    });
    if (customerTurnId && (lodgingOutcome?.lodgingOutcome || lodgingOutcome?.lookups?.length)) {
      await persistIntakeLodgingLookupOnCustomerTurn(
        db,
        customerTurnId,
        lodgingOutcome.lookups || [],
        lodgingOutcome.lodgingOutcome || null,
      );
    }
  }
  await assignTripSiteUrlWhenThingsPresent(db, tripId, env);
  return loadTripThings(db, tripId);
}
