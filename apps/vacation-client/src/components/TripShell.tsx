import type { ReactNode } from 'react';
import type { SharedTripPayload, TabId } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';
import { BuildStampFooter } from './BuildStampFooter';
import { TabNav } from './TabNav';
import { TripHeaderActions } from './TripHeaderActions';

type Props = {
  title: string;
  shareToken: string;
  trip: SharedTripPayload;
  permissions?: SharedTripPayload['permissions'];
  activeTab: TabId;
  canEdit: boolean;
  editChecked: boolean;
  saveStatus: 'idle' | 'checking' | 'saving' | 'saved' | 'error';
  onTabChange: (tab: TabId) => void;
  onSectionVisibilityChange: (key: 'flights' | 'hotels' | 'cars', visible: boolean) => void;
  onActiveTabHidden: () => void;
  children: ReactNode;
};

export function TripShell({
  title,
  shareToken,
  trip,
  permissions,
  activeTab,
  canEdit,
  editChecked,
  saveStatus,
  onTabChange,
  onSectionVisibilityChange,
  onActiveTabHidden,
  children,
}: Props) {
  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-header">
        <div className="tsv-header-brand">
          <img
            className="tsv-header-logo"
            src="/timesyncher-logo-gold.png"
            alt=""
            aria-hidden="true"
            data-ts-header-logo="1"
          />
          <span className="tsv-header-brand-text">TimeSyncher Vacation</span>
        </div>
        <div className="tsv-header-bar">
          <h1 className="tsv-title" title={title}>
            {title}
          </h1>
          <TripHeaderActions
            shareToken={shareToken}
            trip={trip}
            canEdit={canEdit}
            editChecked={editChecked}
            saveStatus={saveStatus}
            activeTab={activeTab}
            onSectionVisibilityChange={onSectionVisibilityChange}
            onActiveTabHidden={onActiveTabHidden}
          />
        </div>
      </header>
      <TabNav active={activeTab} trip={trip} permissions={permissions} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <BuildStampFooter />
    </div>
  );
}
