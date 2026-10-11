import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
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
};

type Props = {
  trip: SharedTripPayload;
  entries: TimelineEntry[];
  onOpen: (place: SharedPlace) => void;
};

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
  if (!place) return null;
  const logo = logoUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const fallback = String(override.icon || place.category?.icon || place.category_icon || '📍');
  return (
    <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
      {logo ? (
        <img className="tsv-timeline-logo" src={logo} alt="" loading="lazy" />
      ) : (
        <span className="tsv-timeline-emoji">{fallback}</span>
      )}
    </span>
  );
}

export function DayTimeline({ trip, entries, onOpen }: Props) {
  if (!entries.length) {
    return <p className="tsv-empty">No timeline-tagged things yet for this day.</p>;
  }

  return (
    <ol className="tsv-timeline-list">
      {entries.map((entry) => {
        const isTravel = entry.kind === 'travel';
        const place = entry.place;
        const category = place ? tabCategoryKey(place, trip) : '';
        const showSummary =
          !isTravel &&
          entry.kind === 'thing' &&
          category !== 'flight' &&
          !/^Travel (to|from)\b/i.test(entry.title) &&
          entry.summary;
        return (
          <li
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
            <div className="tsv-timeline-main">
              {entry.conflictWith ? (
                <div className="tsv-timeline-conflict" data-ts-conflict-label="1">
                  <span className="tsv-timeline-conflict-bar" aria-hidden="true" />
                  Conflict with {entry.conflictWith}
                </div>
              ) : null}
              <div className="tsv-timeline-head">
                <TimelineIcon entry={entry} trip={trip} />
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
              {showSummary ? (
                <p className="tsv-timeline-summary" data-row-summary="1">
                  {entry.summary}
                </p>
              ) : null}
              {!isTravel && entry.itineraryNote ? (
                <p className="tsv-timeline-note">{entry.itineraryNote}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
