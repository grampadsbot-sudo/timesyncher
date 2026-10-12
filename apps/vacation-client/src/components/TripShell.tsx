import type { ReactNode } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';
import { SharedBrandFooter } from './SharedBrandFooter';
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
  permissions,
  activeTab,
  onTabChange,
  children,
}: Props) {
  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-shared-header" data-ts-shared-header="1">
        <h1 className="tsv-shared-header-sr">{title}</h1>
        <div className="tsv-shared-header-sr">
          <TripHeaderActions shareToken={shareToken} permissions={permissions} />
        </div>
      </header>
      <TabNav active={activeTab} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <SharedBrandFooter />
    </div>
  );
}
