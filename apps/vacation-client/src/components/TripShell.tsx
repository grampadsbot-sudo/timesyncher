import type { ReactNode } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';
import { BuildStampFooter } from './BuildStampFooter';
import { TabNav } from './TabNav';
import type { TabId } from '../types/sharedTrip';
import { TripHeaderActions } from './TripHeaderActions';

type Props = {
  title: string;
  shareToken: string;
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
      <header className="tsv-header">
        <h1 className="tsv-title" title={title}>
          {title}
        </h1>
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
