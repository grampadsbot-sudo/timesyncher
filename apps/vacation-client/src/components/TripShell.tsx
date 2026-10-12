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
  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-header">
        <div className="tsv-header-lead">
          <div
            className="tsv-header-brand"
            data-brand-lockup="timesyncher-hourglass-vacation"
            data-hourglass-between="1"
          >
            <span>TimeSyncher</span>
            <img
              className="ts-logo"
              src="/icons/timesyncher-icon-black-transparent.png"
              alt="TimeSyncher"
              width={22}
              height={22}
            />
            <span>Vacation</span>
          </div>
          <h1 className="tsv-title" title={title}>
            {title}
          </h1>
          {dayCount > 0 ? (
            <p className="tsv-header-day-count">{dayCount} days</p>
          ) : null}
        </div>
        <TripHeaderActions shareToken={shareToken} permissions={permissions} />
      </header>
      <TabNav active={activeTab} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <BuildStampFooter />
    </div>
  );
}
