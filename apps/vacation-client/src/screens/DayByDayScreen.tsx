import { DayMap } from '../components/DayMap';
import { placeName, summaryText } from '../lib/placeHelpers';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  onOpen: (place: SharedPlace) => void;
};

export function DayByDayScreen({ trip, onOpen }: Props) {
  const days = trip.days || [];
  const places = trip.places || [];

  return (
    <section className="tsv-screen" data-ts-day-timeline="1">
      {days.length === 0 ? (
        <p className="tsv-empty">No days on this trip yet.</p>
      ) : (
        days.map((day) => {
          const dayPlaces = places.filter((p) => {
            const key = `place:${p.id}`;
            const o = trip.thingOverrides?.[key];
            const dayIds = (o?.dayIds as Array<number | string> | undefined) || [];
            return dayIds.includes(day.id);
          });
          return (
            <article key={String(day.id)} className="tsv-day-card">
              <h2 className="tsv-day-title">
                {day.title || `Day ${day.day_number ?? ''}`}
                {day.date ? <span className="tsv-muted"> · {day.date}</span> : null}
              </h2>
              <ul className="tsv-timeline">
                {dayPlaces.length === 0 ? (
                  <li className="tsv-muted">Nothing scheduled</li>
                ) : (
                  dayPlaces.map((place) => (
                    <li key={String(place.id)} className="tsv-timeline-item">
                      <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
                        {place.category?.icon || '•'}
                      </span>
                      <button type="button" className="tsv-timeline-link" onClick={() => onOpen(place)}>
                        {placeName(place)}
                      </button>
                      {summaryText(place, trip) ? (
                        <p className="tsv-timeline-summary">{summaryText(place, trip)}</p>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
              <DayMap places={dayPlaces.length ? dayPlaces : places} />
            </article>
          );
        })
      )}
    </section>
  );
}
