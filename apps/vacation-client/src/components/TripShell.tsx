import type { ReactNode } from 'react';
import { TabNav } from './TabNav';
import type { TabId } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';

type Props = {
  title: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
};

export function TripShell({ title, activeTab, onTabChange, children }: Props) {
  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-header">
        <h1 className="tsv-title">{title}</h1>
        <div className="tsv-header-actions">
          <button type="button" className="tsv-header-btn" disabled title="P1 skeleton">
            Keepsakes
          </button>
          <button type="button" className="tsv-header-btn" disabled title="P1 skeleton">
            Admin
          </button>
        </div>
      </header>
      <TabNav active={activeTab} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <footer className="tsv-preview-footer">TSV next client preview (not linked from production)</footer>
    </div>
  );
}
