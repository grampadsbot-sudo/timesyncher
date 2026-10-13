import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { categoryLogoGlyph, logoUrlForPlace, opaqueCarPricelineLogoUrl } from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  fallback?: string;
};

export function BudgetLogoChip({ place, trip, fallback = '📍' }: Props) {
  const pricelineCarLogo = opaqueCarPricelineLogoUrl(place, trip);
  const resolvedLogo = logoUrlForPlace(place, trip) || pricelineCarLogo;
  const override = overrideFor(trip, place);
  const glyph = String(
    override.icon || place.category?.icon || place.category_icon || categoryLogoGlyph(place, trip) || fallback,
  );
  const [logoSrc, setLogoSrc] = useState(resolvedLogo);
  const [logoBroken, setLogoBroken] = useState(!resolvedLogo);
  const carBrandOnly = Boolean(pricelineCarLogo);

  const markLogoBroken = () => {
    if (carBrandOnly && pricelineCarLogo && logoSrc !== pricelineCarLogo) {
      setLogoSrc(pricelineCarLogo);
      setLogoBroken(false);
      return;
    }
    if (carBrandOnly) return;
    setLogoBroken(true);
  };

  const showLogo = Boolean(logoSrc) && !logoBroken;

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
          src={logoSrc}
          alt=""
          loading="lazy"
          onError={markLogoBroken}
          onLoad={(event) => {
            const img = event.currentTarget;
            const box = img.getBoundingClientRect();
            if (box.width < 4 || box.height < 4 || img.naturalWidth < 1 || img.naturalHeight < 1) {
              markLogoBroken();
            }
          }}
        />
      ) : carBrandOnly ? (
        <img className="tsv-logo" src={pricelineCarLogo} alt="" loading="lazy" />
      ) : (
        <span className="tsv-logo-fallback">{glyph}</span>
      )}
    </span>
  );
}
