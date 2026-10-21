import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { logoS2FallbackUrlForPlace, logoUrlForPlace } from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';
import { PlaceLogoImg } from './PlaceLogoImg';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  fallback?: string;
};

export function BudgetLogoChip({ place, trip, fallback = '📍' }: Props) {
  const logo = logoUrlForPlace(place, trip) || logoS2FallbackUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const glyph = String(override.icon || place.category?.icon || place.category_icon || fallback);
  const [showFallback, setShowFallback] = useState(!logo);
  return (
    <span className="tsv-logo-chip tsv-budget-logo-chip" data-ts-logo-chip="1" aria-hidden="true">
      {logo && !showFallback ? (
        <PlaceLogoImg
          place={place}
          trip={trip}
          className="tsv-logo"
          onGiveUp={() => setShowFallback(true)}
        />
      ) : (
        <span className="tsv-logo-fallback">{glyph}</span>
      )}
    </span>
  );
}
