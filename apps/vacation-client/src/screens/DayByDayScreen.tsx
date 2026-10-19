import { useCallback, useMemo, useState } from 'react';
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

function formatDayDate(iso: string) {
  const trimmed = String(iso || '').trim();
  if (!trimmed) return '';
  const parsed = Date.parse(trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`);
  if (!Number.isFinite(parsed)) return trimmed;
  return new Date(parsed).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

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

  const panelId = activeDay ? `tsv-day-panel-${activeDay.id}` : undefined;

  const focusDay = useCallback((index: number) => {
    setDayIndex(index);
    if (panelId) {
      requestAnimationFrame(() => document.getElementById(panelId)?.focus());
    }
  }, [panelId]);

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
        <div
          className="tsv-day-chip-row"
          role="tablist"
          aria-label="Trip days"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const delta = event.key === 'ArrowRight' ? 1 : -1;
            focusDay(shiftDayIndex(trip, safeIndex, delta));
          }}
        >
          {days.map((day, index) => {
            const label = dayChipLabel(day);
            const isActive = index === safeIndex;
            const tabId = `tsv-day-tab-${day.id}`;
            const dayPanelId = `tsv-day-panel-${day.id}`;
            const formattedDate = day.date ? formatDayDate(day.date) : '';
            return (
              <button
                key={String(day.id)}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={dayPanelId}
                aria-label={formattedDate ? `${label}, ${formattedDate}` : label}
                className={`tsv-day-chip${isActive ? ' is-active' : ''}`}
                onClick={() => setDayIndex(index)}
              >
                {label}
                {formattedDate ? (
                  <span className="tsv-day-chip-date">{formattedDate}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="tsv-day-map-caption">
          Only things tagged for this day + Timeline appear on the map below.
        </p>
      </header>

      <article
        id={panelId}
        className="tsv-day-card"
        data-ts-day-timeline="1"
        role="tabpanel"
        aria-labelledby={`tsv-day-tab-${activeDay.id}`}
        tabIndex={-1}
      >
        <p className="tsv-day-heading-marker">{dayChipLabel(activeDay)}</p>
        <h3 className="tsv-day-title">
          {dayChipLabel(activeDay)}
          {activeDay.date ? (
            <span className="tsv-muted"> · {formatDayDate(activeDay.date)}</span>
          ) : null}
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
