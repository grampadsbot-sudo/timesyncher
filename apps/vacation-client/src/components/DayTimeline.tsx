import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import {
  NAMED_THING_LOGOS,
  resolveThingLogoUrl,
} from '../../../../src/vacation/thing-logo-capture.mjs';
import { timelineIcon } from '../../../../src/vacation/timeline-icons.mjs';
import { logoUrlForPlace, tabCategoryKey } from '../lib/listTabModel.mjs';
import { overrideFor, placeName } from '../lib/placeHelpers';

type TimelineEntry = {
  id: string;
  kind: string;
  title: string;
  place?: SharedPlace;
  startLabel?: string;
  durationMin?: number | null;
  summary?: string;
  itineraryNote?: string;
  conflictWith?: string;
  category?: string;
};

type Props = {
  trip: SharedTripPayload;
  entries: TimelineEntry[];
  onOpen: (place: SharedPlace) => void;
};

function airlineLogoFromTitle(title = '') {
  const label = String(title || '');
  if (/\bsouthwest\b/i.test(label)) return NAMED_THING_LOGOS.southwest;
  if (/\bjetblue\b/i.test(label)) return NAMED_THING_LOGOS.jetblue;
  if (/\bunited\b/i.test(label)) return NAMED_THING_LOGOS.united;
  if (/\bdelta\b/i.test(label)) return NAMED_THING_LOGOS.delta;
  if (/\bamerican\b/i.test(label)) return NAMED_THING_LOGOS.american;
  return '';
}

function TimelineIcon({
  entry,
  trip,
}: {
  entry: TimelineEntry;
  trip: SharedTripPayload;
}) {
  if (entry.kind === 'travel') {
    return (
      <span className="tsv-timeline-icon tsv-timeline-icon--travel" data-ts-timeline-icon="1">
        🚗
      </span>
    );
  }

  const place = entry.place;
  const stub = place || {
    name: entry.title,
    category_name:
      entry.category === 'flight' || /flight/i.test(entry.title) ? 'Flight' : 'Attraction',
  };
  const override = place ? overrideFor(trip, place) : {};
  const isFlight =
    entry.kind === 'flight' ||
    entry.category === 'flight' ||
    /^Flight option:/i.test(entry.title);
  const resolved = timelineIcon(stub, override, isFlight ? 'flight' : '');
  const flightTitle = entry.title || place?.name || '';
  let logo = isFlight ? airlineLogoFromTitle(flightTitle) : '';
  if (!logo && place) {
    logo = logoUrlForPlace(place, trip) || resolveThingLogoUrl(place, override) || resolved.logoUrl;
  } else if (!logo) {
    logo = resolved.logoUrl || resolveThingLogoUrl(stub, override);
  }
  if (isFlight && !logo) {
    logo = airlineLogoFromTitle(flightTitle);
  }
  const [logoBroken, setLogoBroken] = useState(false);
  const flightGlyph = resolved.icon || '✈️';
  const flightLogo = isFlight ? logo || airlineLogoFromTitle(flightTitle) : logo;

  if (isFlight) {
    const src = flightLogo || airlineLogoFromTitle(flightTitle);
    const showImg = Boolean(src) && !logoBroken;
    return (
      <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
        {showImg && src ? (
          <img
            className="tiny-logo tsv-timeline-logo"
            src={src}
            alt=""
            width={22}
            height={22}
            loading="eager"
            decoding="sync"
            data-ts-timeline-logo="1"
            onError={() => setLogoBroken(true)}
          />
        ) : (
          <span className="tsv-timeline-emoji">{flightGlyph}</span>
        )}
      </span>
    );
  }

  const showLogo = Boolean(flightLogo) && !logoBroken;
  const showEmoji = !showLogo || logoBroken;

  return (
    <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
      {showLogo && flightLogo ? (
        <img
          className="tiny-logo"
          src={flightLogo}
          alt=""
          width={22}
          height={22}
          loading="eager"
          decoding="sync"
          data-ts-timeline-logo="1"
          onError={() => setLogoBroken(true)}
        />
      ) : null}
      {showEmoji ? <span className="tsv-timeline-emoji">{flightGlyph}</span> : null}
    </span>
  );
}

export function DayTimeline({ trip, entries, onOpen }: Props) {
  if (!entries.length) {
    return <p className="tsv-empty">No timeline-tagged things yet for this day.</p>;
  }

  return (
    <div className="tsv-timeline-list">
      {entries.map((entry) => {
        const isTravel = entry.kind === 'travel';
        const isFlight = entry.kind === 'flight';
        const place = entry.place;
        const category = place ? tabCategoryKey(place, trip) : entry.category || '';
        const showSummary =
          !isTravel &&
          !isFlight &&
          entry.kind === 'thing' &&
          category !== 'flight' &&
          !/^Travel (to|from)\b/i.test(entry.title) &&
          entry.summary;
        return (
          <div
            key={entry.id}
            className={`tsv-timeline-row${entry.conflictWith ? ' is-conflict' : ''}`}
            data-ts-timeline-row="1"
          >
            <div className="tsv-timeline-time-col">
              {!isTravel && entry.startLabel ? (
                <span className="tsv-timeline-time">{entry.startLabel}</span>
              ) : null}
              {entry.durationMin != null ? (
                <span className="tsv-timeline-duration">
                  {isTravel ? `${entry.durationMin} min` : `${entry.durationMin} min`}
                </span>
              ) : null}
            </div>
            <TimelineIcon entry={entry} trip={trip} />
            {entry.conflictWith ? (
              <div
                className="tsv-timeline-conflict tsv-timeline-conflict--full"
                data-ts-conflict-label="1"
              >
                <span className="tsv-timeline-conflict-bar" aria-hidden="true" />
                Conflict with {entry.conflictWith}
              </div>
            ) : null}
            <div className="tsv-timeline-head">
              {isTravel || !place ? (
                <span className="tsv-timeline-title" data-ts-timeline-title="1">
                  {entry.title}
                </span>
              ) : (
                <button
                  type="button"
                  className="tsv-timeline-title tsv-timeline-link"
                  data-ts-timeline-title="1"
                  onClick={() => onOpen(place)}
                >
                  {entry.title || placeName(place)}
                </button>
              )}
            </div>
            {showSummary || (!isTravel && entry.itineraryNote) ? (
              <div className="tsv-timeline-details">
                {showSummary ? (
                  <p
                    className="tsv-timeline-summary"
                    data-row-summary="1"
                    data-summary-stored="1"
                    data-summary-src="thing"
                  >
                    {entry.summary}
                  </p>
                ) : null}
                {!isTravel && entry.itineraryNote ? (
                  <p className="tsv-timeline-note">{entry.itineraryNote}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
