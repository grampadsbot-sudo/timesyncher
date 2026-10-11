import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { logoUrlForPlace } from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  fallback?: string;
};

export function BudgetLogoChip({ place, trip, fallback = '📍' }: Props) {
  const logo = logoUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const glyph = String(override.icon || place.category?.icon || place.category_icon || fallback);
  return (
    <span className="tsv-logo-chip tsv-budget-logo-chip" data-ts-logo-chip="1" aria-hidden="true">
      {logo ? (
        <img className="tsv-logo" src={logo} alt="" />
      ) : (
        <span className="tsv-logo-fallback">{glyph}</span>
      )}
    </span>
  );
}
