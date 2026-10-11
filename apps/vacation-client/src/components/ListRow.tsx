import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { logoUrl, placeName, priceLabel, summaryText } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  onOpen: (place: SharedPlace) => void;
};

export function ListRow({ place, trip, onOpen }: Props) {
  const name = placeName(place);
  const price = priceLabel(place, trip);
  const summary = summaryText(place, trip);
  const logo = logoUrl(place, trip);

  return (
    <li className="tsv-row" data-ts-list-row="1">
      <button type="button" className="tsv-row-main" onClick={() => onOpen(place)}>
        <span className="tsv-logo-chip" data-ts-logo-chip="1" aria-hidden="true">
          {logo ? (
            <img className="tsv-logo" src={logo} alt="" />
          ) : (
            <span className="tsv-logo-fallback">{place.category?.icon || '📍'}</span>
          )}
        </span>
        <span className="tsv-row-name" data-ts-list-row-name="1">
          {name}
        </span>
        {price ? <span className="tsv-row-price">{price}</span> : null}
        {summary ? <span className="tsv-row-desc">{summary}</span> : null}
      </button>
    </li>
  );
}
