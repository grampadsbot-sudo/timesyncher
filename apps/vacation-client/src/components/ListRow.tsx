import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import {
  carPriceDisplay,
  carSubtitle,
  categoryLogoGlyph,
  eventListPriceDisplay,
  flightPriceDisplay,
  flightSchedule,
  formatUsd,
  hotelFirstRowNote,
  hotelPriceDisplay,
  logoUrlForPlace,
  numericPrice,
  opaqueCarPricelineLogoUrl,
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
  const pricelineCarLogo = opaqueCarPricelineLogoUrl(place, trip);
  const baseLogo = logoUrlForPlace(place, trip) || pricelineCarLogo;
  const [retrySrc, setRetrySrc] = useState('');
  const [logoBroken, setLogoBroken] = useState(false);
  const logoSrc = retrySrc || baseLogo;
  const override = overrideFor(trip, place);
  const fallback =
    text(override.icon) ||
    text(place.category?.icon) ||
    text(place.category_icon) ||
    categoryLogoGlyph(place, trip);
  const carBrandOnly = Boolean(pricelineCarLogo);

  const markLogoBroken = () => {
    if (carBrandOnly && pricelineCarLogo && logoSrc !== pricelineCarLogo) {
      setRetrySrc(pricelineCarLogo);
      setLogoBroken(false);
      return;
    }
    if (carBrandOnly) return;
    setLogoBroken(true);
  };

  const showLogo = Boolean(logoSrc) && !logoBroken;

  return (
    <span
      className="tsv-logo-chip"
      data-ts-logo-chip="1"
      data-has-logo={showLogo ? '1' : '0'}
      data-ts-fallback-emoji={fallback}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          className="tsv-logo tiny-logo"
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
        <img className="tsv-logo tiny-logo" src={pricelineCarLogo} alt="" loading="lazy" />
      ) : (
        <span className="tsv-logo-fallback">{fallback}</span>
      )}
    </span>
  );
}

function text(value: unknown) {
  return String(value ?? '').trim();
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
      <li className="tsv-row tsv-row-flight" data-ts-list-row="1" data-list-row="1">
        <div className="tsv-row-car-grid">
          <button
            type="button"
            className="tsv-row-main tsv-row-flight-main"
            aria-label="Open thing details"
            onClick={() => onOpen(place)}
          >
            <LogoChip key={String(place.id)} place={place} trip={trip} />
            <span className="tsv-row-name" data-ts-list-row-name="1">
              {name}
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
            {summary ? (
              <span className="tsv-row-desc" data-list-summary="1" data-summary-src="thing">
                {summary}
              </span>
            ) : null}
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
      <li className="tsv-row tsv-row-car" data-ts-list-row="1" data-list-row="1">
        <div className="tsv-row-car-grid">
          <button
            type="button"
            className="tsv-row-car-main"
            aria-label="Open thing details"
            onClick={() => onOpen(place)}
          >
            <span className="tsv-row-car-head">
              <LogoChip key={String(place.id)} place={place} trip={trip} />
              <span className="tsv-row-name" data-ts-list-row-name="1">
                {name}
              </span>
              {subtitle ? <span className="tsv-row-car-sub">{subtitle}</span> : null}
            </span>
            {price ? <span className="tsv-row-price">{price}</span> : null}
            {summary ? (
            <span
              className="tsv-row-desc tsv-row-car-desc"
              data-list-summary="1"
              data-summary-src="thing"
            >
              {summary}
            </span>
          ) : null}
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
    tab === 'events'
      ? eventListPriceDisplay(place, trip)
      : tab === 'hotels' || category === 'hotel'
        ? hotelPriceDisplay(place, trip)
        : numeric == null || numeric <= 0
          ? ''
          : formatUsd(numeric, currency);

  if (tab === 'events') {
    return (
      <li className="tsv-row tsv-row-event" data-ts-list-row="1" data-list-row="1">
        <div className="tsv-row-car-grid">
          <button
            type="button"
            className="tsv-row-main tsv-row-event-main"
            aria-label="Open thing details"
            onClick={() => onOpen(place)}
          >
            <span className="tsv-row-car-head">
              <LogoChip key={String(place.id)} place={place} trip={trip} />
              <span className="tsv-row-name" data-ts-list-row-name="1">
                {name}
              </span>
            </span>
            {price ? (
              <span className="tsv-row-price" data-ts-event-price="1">
                {price}
              </span>
            ) : null}
            {summary ? (
              <span className="tsv-row-desc tsv-row-event-desc" data-list-summary="1" data-summary-src="thing">
                {summary}
              </span>
            ) : null}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="tsv-row" data-ts-list-row="1" data-list-row="1">
      <div className="tsv-row-car-grid">
        <button type="button" className="tsv-row-main" aria-label="Open thing details" onClick={() => onOpen(place)}>
          <LogoChip key={String(place.id)} place={place} trip={trip} />
          <span className="tsv-row-name" data-ts-list-row-name="1">
            {name}
          </span>
          {price ? <span className="tsv-row-price">{price}</span> : null}
          {note ? <span className="tsv-row-hotel-note">{note}</span> : null}
          {summary ? (
            <span className="tsv-row-desc" data-list-summary="1" data-summary-src="thing">
              {summary}
            </span>
          ) : null}
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
