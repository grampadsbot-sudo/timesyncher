import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { categoryLogoGlyph, logoUrlForPlace } from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  fallback?: string;
};

export function BudgetLogoChip({ place, trip, fallback = '📍' }: Props) {
  const logo = logoUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const glyph = String(
    override.icon || place.category?.icon || place.category_icon || categoryLogoGlyph(place, trip) || fallback,
  );
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(logo) && !logoBroken;

  return (
    <span
      className="tsv-logo-chip tsv-budget-logo-chip"
      data-ts-logo-chip="1"
      data-has-logo={showLogo ? '1' : '0'}
      data-ts-fallback-emoji={glyph}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          className="tsv-logo"
          src={logo}
          alt=""
          loading="lazy"
          onError={() => setLogoBroken(true)}
          onLoad={(event) => {
            const img = event.currentTarget;
            const box = img.getBoundingClientRect();
            if (box.width < 4 || box.height < 4 || img.naturalWidth < 1 || img.naturalHeight < 1) {
              setLogoBroken(true);
            }
          }}
        />
      ) : (
        <span className="tsv-logo-fallback">{glyph}</span>
      )}
    </span>
  );
}
