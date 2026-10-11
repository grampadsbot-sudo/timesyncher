import { useMemo, useState } from 'react';
import { DayMap } from '../components/DayMap';
import { DayTimeline } from '../components/DayTimeline';
import {
  buildDayTimeline,
  dayChipLabel,
  mapPlacesForTimeline,
  shiftDayIndex,
  sortedDays,
} from '../lib/dayTimelineModel.mjs';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  onOpen: (place: SharedPlace) => void;
};

export function DayByDayScreen({ trip, onOpen }: Props) {
  const days = useMemo(() => sortedDays(trip), [trip]);
  const [dayIndex, setDayIndex] = useState(0);
  const safeIndex = days.length ? Math.min(dayIndex, days.length - 1) : 0;
  const activeDay = days[safeIndex];

  const entries = useMemo(() => {
    if (!activeDay) return [];
    return buildDayTimeline(trip, activeDay);
  }, [trip, activeDay]);

  const mapPlaces = useMemo(() => mapPlacesForTimeline(trip, entries), [trip, entries]);

  if (!days.length) {
    return (
      <section className="tsv-screen tsv-day-screen">
        <p className="tsv-empty">No days on this trip yet.</p>
      </section>
    );
  }

  return (
    <section className="tsv-screen tsv-day-screen">
      <header className="tsv-day-view-head">
        <h2 className="tsv-day-view-title">Vacation Day View</h2>
        <div className="tsv-day-chip-row" role="tablist" aria-label="Trip days">
          {days.map((day, index) => {
            const label = dayChipLabel(day);
            const isActive = index === safeIndex;
            return (
              <button
                key={String(day.id)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                className={`tsv-day-chip${isActive ? ' is-active' : ''}`}
                onClick={() => setDayIndex(index)}
              >
                {label}
                {day.date ? <span className="tsv-day-chip-date">{day.date}</span> : null}
              </button>
            );
          })}
        </div>
        <p className="tsv-day-map-caption">
          Only things tagged for this day + Timeline appear on the map below.
        </p>
      </header>

      <article className="tsv-day-card" data-ts-day-timeline="1">
        <h3 className="tsv-day-title">
          {dayChipLabel(activeDay)}
          {activeDay.date ? <span className="tsv-muted"> · {activeDay.date}</span> : null}
        </h3>
        <DayTimeline trip={trip} entries={entries} onOpen={onOpen} />
        <div className="tsv-day-nav">
          <button
            type="button"
            className="tsv-day-nav-btn"
            disabled={safeIndex <= 0}
            onClick={() => setDayIndex((idx) => shiftDayIndex(trip, idx, -1))}
          >
            Previous day
          </button>
          <button
            type="button"
            className="tsv-day-nav-btn"
            disabled={safeIndex >= days.length - 1}
            onClick={() => setDayIndex((idx) => shiftDayIndex(trip, idx, 1))}
          >
            Next day
          </button>
        </div>
      </article>

      <DayMap places={mapPlaces} />
    </section>
  );
}
