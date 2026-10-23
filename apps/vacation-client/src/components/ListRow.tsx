import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import {
  carPriceDisplay,
  carSubtitle,
  flightPriceDisplay,
  flightSchedule,
  formatUsd,
  hotelFirstRowNote,
  hotelPriceDisplay,
  logoUrlForPlace,
  numericPrice,
  placeName,
  rowSummary,
  tabCategoryKey,
} from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';

type TabKind = 'flights' | 'hotels' | 'cars' | 'restaurants' | 'stores' | 'events';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  tab: TabKind;
  onOpen: (place: SharedPlace) => void;
  isFirstHotel?: boolean;
  showTimelineToggle?: boolean;
  timelineChecked?: boolean;
  timelineDisabled?: boolean;
  onTimelineChange?: (place: SharedPlace, checked: boolean) => void;
};

function LogoChip({ place, trip }: { place: SharedPlace; trip: SharedTripPayload }) {
  const logo = logoUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const fallback = String(override.icon || place.category?.icon || place.category_icon || '📍');
  return (
    <span className="tsv-logo-chip" data-ts-logo-chip="1" aria-hidden="true">
      {logo ? (
        <img className="tsv-logo" src={logo} alt="" />
      ) : (
        <span className="tsv-logo-fallback">{fallback}</span>
      )}
    </span>
  );
}

function TimelineToggle({
  place,
  checked,
  disabled,
  onTimelineChange,
}: {
  place: SharedPlace;
  checked: boolean;
  disabled?: boolean;
  onTimelineChange?: (place: SharedPlace, checked: boolean) => void;
}) {
  return (
    <label className="tsv-timeline-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onTimelineChange?.(place, event.target.checked)}
      />
      <span>Timeline</span>
    </label>
  );
}

export function ListRow({
  place,
  trip,
  tab,
  onOpen,
  isFirstHotel = false,
  showTimelineToggle = false,
  timelineChecked = false,
  timelineDisabled = false,
  onTimelineChange,
}: Props) {
  const name = placeName(place);
  const summary = rowSummary(place, trip);
  const category = tabCategoryKey(place, trip);
  const note = tab === 'hotels' ? hotelFirstRowNote(place, trip, isFirstHotel) : '';

  if (tab === 'flights' || category === 'flight') {
    const price = flightPriceDisplay(place, trip);
    const { depart, arrive } = flightSchedule(place, trip);
    return (
      <li className="tsv-row tsv-row-flight" data-ts-list-row="1">
        <div className="tsv-row-car-grid">
          <button type="button" className="tsv-row-main tsv-row-flight-main" onClick={() => onOpen(place)}>
            <LogoChip place={place} trip={trip} />
            <span className="tsv-row-name" data-ts-list-row-name="1">
              <strong>{name}</strong>
            </span>
            {price ? (
              <span className="tsv-row-price" data-ts-flight-price="1">
                {price}
              </span>
            ) : null}
            {depart ? (
              <span className="tsv-row-flight-time" data-ts-flight-depart="1">
                {depart}
              </span>
            ) : null}
            {arrive ? (
              <span className="tsv-row-flight-time" data-ts-flight-arrive="1">
                {arrive}
              </span>
            ) : null}
            {summary ? <span className="tsv-row-desc">{summary}</span> : null}
          </button>
          {showTimelineToggle ? (
            <TimelineToggle
              place={place}
              checked={timelineChecked}
              disabled={timelineDisabled}
              onTimelineChange={onTimelineChange}
            />
          ) : null}
        </div>
      </li>
    );
  }

  if (tab === 'cars' || category === 'car') {
    const price = carPriceDisplay(place, trip);
    const subtitle = carSubtitle(place, trip);
    return (
      <li className="tsv-row tsv-row-car" data-ts-list-row="1">
        <div className="tsv-row-car-grid">
          <button type="button" className="tsv-row-car-main" onClick={() => onOpen(place)}>
            <span className="tsv-row-car-head">
              <LogoChip place={place} trip={trip} />
              <span className="tsv-row-name" data-ts-list-row-name="1">
                <strong>{name}</strong>
              </span>
              {subtitle ? <span className="tsv-row-car-sub">{subtitle}</span> : null}
            </span>
            {price ? <span className="tsv-row-price">{price}</span> : null}
            {summary ? <span className="tsv-row-desc tsv-row-car-desc">{summary}</span> : null}
          </button>
          {showTimelineToggle ? (
            <TimelineToggle
              place={place}
              checked={timelineChecked}
              disabled={timelineDisabled}
              onTimelineChange={onTimelineChange}
            />
          ) : null}
        </div>
      </li>
    );
  }

  const numeric = numericPrice(place, trip);
  const currency = trip.trip?.currency || 'USD';
  const price =
    tab === 'hotels' || category === 'hotel'
      ? hotelPriceDisplay(place, trip)
      : numeric == null
        ? ''
        : formatUsd(numeric, currency);

  return (
    <li className="tsv-row" data-ts-list-row="1">
      <div className="tsv-row-car-grid">
        <button type="button" className="tsv-row-main" onClick={() => onOpen(place)}>
          <LogoChip place={place} trip={trip} />
          <span className="tsv-row-name" data-ts-list-row-name="1">
            <strong>{name}</strong>
          </span>
          {price ? <span className="tsv-row-price">{price}</span> : null}
          {note ? <span className="tsv-row-hotel-note">{note}</span> : null}
          {summary ? <span className="tsv-row-desc">{summary}</span> : null}
        </button>
        {showTimelineToggle && (tab === 'hotels' || category === 'hotel') ? (
          <TimelineToggle
            place={place}
            checked={timelineChecked}
            disabled={timelineDisabled}
            onTimelineChange={onTimelineChange}
          />
        ) : null}
      </div>
    </li>
  );
}
