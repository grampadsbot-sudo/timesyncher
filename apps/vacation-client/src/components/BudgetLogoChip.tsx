import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { categoryLogoGlyph, logoSrcCandidates } from '../lib/listTabModel.mjs';
import { useResolvedLogo } from '../lib/useResolvedLogo';
import { overrideFor } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  fallback?: string;
};

export function BudgetLogoChip({ place, trip, fallback = '📍' }: Props) {
  const logoSrc = useResolvedLogo(logoSrcCandidates(place, trip));
  const override = overrideFor(trip, place);
  const glyph = String(
    override.icon || place.category?.icon || place.category_icon || categoryLogoGlyph(place, trip) || fallback,
  );
  const showLogo = Boolean(logoSrc);

  return (
    <span
      className="tsv-logo-chip tsv-budget-logo-chip"
      data-ts-logo-chip="1"
      data-has-logo={showLogo ? '1' : '0'}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          className="tsv-logo"
          src={logoSrc}
          alt=""
          width={18}
          height={18}
          loading="eager"
          decoding="sync"
        />
      ) : (
        <span className="tsv-logo-fallback">{glyph}</span>
      )}
    </span>
  );
}
