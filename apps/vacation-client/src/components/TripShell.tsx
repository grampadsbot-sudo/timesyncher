import type { ReactNode } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';
import { sortedDays } from '../lib/dayTimelineModel.mjs';
import { BuildStampFooter } from './BuildStampFooter';
import { TabNav } from './TabNav';
import type { TabId } from '../types/sharedTrip';
import { TripHeaderActions } from './TripHeaderActions';

type Props = {
  title: string;
  shareToken: string;
  trip?: SharedTripPayload;
  permissions?: SharedTripPayload['permissions'];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
};

function formatTripDates(trip?: SharedTripPayload) {
  const start = trip?.trip?.start_date;
  const end = trip?.trip?.end_date;
  if (!start && !end) return '';
  const fmt = (value: string) => {
    try {
      return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {
      return value;
    }
  };
  return [start, end].filter(Boolean).map(fmt).join(' — ');
}

export function TripShell({
  title,
  shareToken,
  trip,
  permissions,
  activeTab,
  onTabChange,
  children,
}: Props) {
  const dayCount = trip ? sortedDays(trip).length : 0;
  const dateRange = formatTripDates(trip);
  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-hero-header">
        <div className="tsv-hero-toolbar">
          <TripHeaderActions shareToken={shareToken} permissions={permissions} />
        </div>
        <div
          className="tsv-hero-brand"
          data-brand-lockup="timesyncher-hourglass-vacation"
          data-hourglass-between="1"
        >
          <span>TimeSyncher</span>
          <img
            className="ts-logo"
            src="/icons/timesyncher-icon-white-transparent.png"
            alt="TimeSyncher"
            width={22}
            height={22}
          />
          <span>Vacation</span>
        </div>
        <h1 className="tsv-hero-title" title={title}>
          {title}
        </h1>
        {dateRange ? <p className="tsv-hero-dates">{dateRange}</p> : null}
        {dayCount > 0 ? <p className="tsv-hero-day-count">{dayCount} days</p> : null}
      </header>
      <TabNav active={activeTab} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <BuildStampFooter />
    </div>
  );
}
